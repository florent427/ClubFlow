import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentScheduleStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { invoicePaymentTotals } from './invoice-totals';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Crée des sessions Stripe Checkout pour régler une facture depuis le portail.
 * Le webhook `payment_intent.succeeded` (dans PaymentsService) prend le relai
 * pour enregistrer le Payment et marquer la facture comme PAID.
 *
 * Encaissement en *direct charges* sur le compte connecté du club
 * (cf. ADR-0008) : la session est créée « au nom de » `acct_xxx`, donc les
 * fonds arrivent chez le club et non sur le compte plateforme.
 */
@Injectable()
export class StripeCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connect: StripeConnectService,
  ) {}

  private getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new BadRequestException(
        'Paiement en ligne indisponible : STRIPE_SECRET_KEY non configurée.',
      );
    }
    return new Stripe(key);
  }

  /**
   * `returnPath` paramétrable, `/facturation` par défaut.
   *
   * Une facture ramène vers l'espace Facturation ; une commande boutique doit
   * ramener vers `/boutique`. Sans ce paramètre, l'acheteur retombait sur la
   * page Facturation, réservée aux payeurs du foyer — un membre acheteur
   * non-payeur y voyait « accès réservé » APRÈS avoir payé. Le défaut préserve
   * strictement le comportement des factures.
   */
  private successAndCancelUrls(
    clubSlug: string | null,
    returnPath = '/facturation',
  ): {
    successUrl: string;
    cancelUrl: string;
  } {
    const base =
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
    const slug = clubSlug ?? '';
    const qs = slug ? `?club=${encodeURIComponent(slug)}` : '';
    return {
      successUrl: `${base}${returnPath}${qs}${qs ? '&' : '?'}paid=1`,
      cancelUrl: `${base}${returnPath}${qs}${qs ? '&' : '?'}canceled=1`,
    };
  }

  /**
   * Calcule le solde restant d'une facture et prépare une session Checkout.
   * L'appelant doit avoir déjà vérifié que le viewer a le droit de payer.
   */
  async createInvoiceCheckoutSession(args: {
    invoiceId: string;
    clubId: string;
    paidByMemberId: string | null;
    /**
     * Nombre de versements souhaités côté payeur (1 ou 3). Pour 3, on
     * active l'option `payment_method_options.card.installments` côté
     * Stripe — fonctionne uniquement si le compte Stripe du club a
     * activé les paiements en plusieurs fois (sinon Stripe propose
     * automatiquement un fallback paiement comptant). Le marquage
     * `installmentsCount` sur l'Invoice est posé en amont par le
     * resolver pour que le club voie le choix dans son back-office.
     */
    installmentsCount?: number;
    /**
     * Chemin de retour après paiement (défaut `/facturation`). La boutique
     * passe `/boutique` pour que l'acheteur revienne à sa commande et non à
     * l'espace Facturation réservé aux payeurs.
     */
    returnPath?: string;
  }): Promise<{ url: string; sessionId: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: args.invoiceId,
        clubId: args.clubId,
        status: InvoiceStatus.OPEN,
      },
      include: { paymentSchedule: { select: { status: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable ou déjà réglée.');
    }

    // Un échéancier en cours couvre DÉJÀ tout le solde de la facture. Laisser
    // payer en plus, c'est encaisser deux fois : le paiement solde la facture
    // mais n'éteint pas les échéances, que le moteur continue de prélever.
    //
    // Le contrôle est ici, dans le service, et non dans les resolvers : c'est
    // le seul point de passage commun au portail, au mobile — y compris les
    // versions déjà installées, qui affichent encore un bouton « payer le
    // solde » — et à tout futur client.
    const scheduleStatus = invoice.paymentSchedule?.status;
    if (
      scheduleStatus === PaymentScheduleStatus.ACTIVE ||
      scheduleStatus === PaymentScheduleStatus.PENDING_SETUP
    ) {
      throw new BadRequestException(
        'Cette facture est réglée par un échéancier. Annulez-le avant de payer le solde en une fois.',
      );
    }

    const paidAgg = await this.prisma.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amountCents: true },
    });
    const paidBefore = paidAgg._sum.amountCents ?? 0;
    const { balanceCents } = invoicePaymentTotals(
      invoice.amountCents,
      paidBefore,
    );
    if (balanceCents <= 0) {
      throw new BadRequestException('Facture déjà soldée.');
    }

    const club = await this.prisma.club.findUnique({
      where: { id: args.clubId },
      select: { slug: true, name: true },
    });
    const { successUrl, cancelUrl } = this.successAndCancelUrls(
      club?.slug ?? null,
      args.returnPath,
    );

    const metadata: Record<string, string> = {
      invoiceId: invoice.id,
      clubId: invoice.clubId,
    };
    if (args.paidByMemberId) {
      metadata.paidByMemberId = args.paidByMemberId;
    }

    // Compte connecté du club : throw explicite si l'onboarding Stripe
    // n'est pas terminé. Pas de repli sur le compte plateforme (ADR-0008).
    const stripeAccount = await this.connect.requireChargeableAccount(
      args.clubId,
    );
    // Tracé dans les metadata pour que le webhook puisse vérifier que
    // l'événement provient bien du compte attendu.
    metadata.stripeAccountId = stripeAccount;

    const stripe = this.getStripe();
    const installmentsRequested =
      typeof args.installmentsCount === 'number' && args.installmentsCount > 1;
    if (installmentsRequested) {
      metadata.installmentsRequested = String(args.installmentsCount);
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: balanceCents,
            product_data: {
              name: invoice.label,
              description: club?.name ?? undefined,
            },
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      // Stripe propose au payeur le choix "comptant ou en plusieurs
      // fois" si le compte du club a activé les installments France.
      // On exprime simplement l'intention ; en cas d'incompatibilité,
      // Stripe retombe automatiquement sur un paiement comptant.
      ...(installmentsRequested
        ? {
            payment_method_options: {
              card: { installments: { enabled: true } },
            },
          }
        : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    // Direct charge : la session vit sur le compte du club, les fonds y
    // arrivent directement. `application_fee_amount` n'est volontairement
    // pas envoyé — la commission plateforme n'est pas tranchée (ADR-0008),
    // et ce montage permettra de l'ajouter sans migration.
    { stripeAccount });

    if (!session.url) {
      throw new BadRequestException(
        'Impossible de créer la session de paiement Stripe.',
      );
    }
    return { url: session.url, sessionId: session.id };
  }
}
