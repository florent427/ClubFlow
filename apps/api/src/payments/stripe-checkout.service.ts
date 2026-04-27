import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { invoicePaymentTotals } from './invoice-totals';

/**
 * Crée des sessions Stripe Checkout pour régler une facture depuis le portail.
 * Le webhook `payment_intent.succeeded` (dans PaymentsService) prend le relai
 * pour enregistrer le Payment et marquer la facture comme PAID.
 */
@Injectable()
export class StripeCheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  private getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new BadRequestException(
        'Paiement en ligne indisponible : STRIPE_SECRET_KEY non configurée.',
      );
    }
    return new Stripe(key);
  }

  private successAndCancelUrls(clubSlug: string | null): {
    successUrl: string;
    cancelUrl: string;
  } {
    const base =
      process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
    const slug = clubSlug ?? '';
    const qs = slug ? `?club=${encodeURIComponent(slug)}` : '';
    return {
      successUrl: `${base}/facturation${qs}${qs ? '&' : '?'}paid=1`,
      cancelUrl: `${base}/facturation${qs}${qs ? '&' : '?'}canceled=1`,
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
  }): Promise<{ url: string; sessionId: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: args.invoiceId,
        clubId: args.clubId,
        status: InvoiceStatus.OPEN,
      },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable ou déjà réglée.');
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
    );

    const metadata: Record<string, string> = {
      invoiceId: invoice.id,
      clubId: invoice.clubId,
    };
    if (args.paidByMemberId) {
      metadata.paidByMemberId = args.paidByMemberId;
    }

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
    });

    if (!session.url) {
      throw new BadRequestException(
        'Impossible de créer la session de paiement Stripe.',
      );
    }
    return { url: session.url, sessionId: session.id };
  }
}
