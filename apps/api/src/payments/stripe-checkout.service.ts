import {
  BadRequestException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(StripeCheckoutService.name);

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
   * Lien profond que l'app mobile surveille pour se refermer après paiement.
   * `openAuthSessionAsync(stripeUrl, APP_RETURN_DEEP_LINK)` : le navigateur
   * intégré se ferme dès que Stripe → page-relais → ce scheme.
   */
  private static readonly APP_RETURN_DEEP_LINK = 'clubflow://payment-return';

  /**
   * URLs de retour Stripe, selon la cible.
   *
   * WEB (`nativeApp=false`) : URL https classique vers l'espace concerné
   * (`/facturation` par défaut, `/boutique` pour la boutique). Le champ
   * `paymentReturnUrl` renvoyé au client vaut cette URL de succès.
   *
   * APP (`nativeApp=true`) : Stripe n'accepte que du https, mais l'app ne peut
   * être rappelée que par un LIEN PROFOND. On envoie donc Stripe vers la
   * page-relais statique `/app-return.html` (portail), qui rebondit aussitôt sur
   * `clubflow://payment-return`. Le client surveille CE scheme, pas l'URL https :
   * `paymentReturnUrl` vaut alors le lien profond. Sans ça, le navigateur
   * chargeait la page web et ne rendait jamais la main à l'app.
   */
  private returnUrls(
    clubSlug: string | null,
    returnPath: string,
    nativeApp: boolean,
  ): { successUrl: string; cancelUrl: string; paymentReturnUrl: string } {
    const base = process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
    if (nativeApp) {
      return {
        successUrl: `${base}/app-return.html?paid=1`,
        cancelUrl: `${base}/app-return.html?canceled=1`,
        paymentReturnUrl: StripeCheckoutService.APP_RETURN_DEEP_LINK,
      };
    }
    const slug = clubSlug ?? '';
    const qs = slug ? `?club=${encodeURIComponent(slug)}` : '';
    const successUrl = `${base}${returnPath}${qs}${qs ? '&' : '?'}paid=1`;
    return {
      successUrl,
      cancelUrl: `${base}${returnPath}${qs}${qs ? '&' : '?'}canceled=1`,
      paymentReturnUrl: successUrl,
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
    /**
     * Appel depuis l'app mobile : le retour Stripe passe par la page-relais
     * `/app-return.html` qui rebondit sur le lien profond `clubflow://`, et le
     * `paymentReturnUrl` renvoyé est ce lien profond (à surveiller par
     * `openAuthSessionAsync`). Défaut `false` = web, comportement inchangé.
     */
    nativeApp?: boolean;
  }): Promise<{ url: string; sessionId: string; paymentReturnUrl: string }> {
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
    const { successUrl, cancelUrl, paymentReturnUrl } = this.returnUrls(
      club?.slug ?? null,
      args.returnPath ?? '/facturation',
      args.nativeApp ?? false,
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

    // Mémorise la session AVANT de rendre la main : c'est le seul moyen de
    // pouvoir l'expirer si la facture cesse d'être due (commande annulée).
    // Sans cette trace, un onglet Stripe resté ouvert encaisse pour une
    // commande annulée et il faut rembourser à la main.
    //
    // Le compte est figé ici, pas relu plus tard : une session ne s'expire que
    // depuis le compte qui la porte.
    await this.prisma.invoice.updateMany({
      where: { id: invoice.id, clubId: args.clubId },
      data: {
        stripeCheckoutSessionId: session.id,
        stripeCheckoutAccountId: stripeAccount,
      },
    });
    // `successUrl` est REMONTÉ à l'appelant en plus de l'URL Stripe : c'est
    // l'URL de succès réellement posée sur la session (redirection après
    // paiement). Le client mobile ouvre Stripe avec
    // `WebBrowser.openAuthSessionAsync(url, returnPrefix)` et a besoin de
    // connaître ce préfixe pour savoir QUAND refermer le navigateur intégré :
    // Stripe exige un `success_url` https, un scheme `clubflow://` serait
    // rejeté. On expose donc l'URL déjà posée, sans la modifier ; le web
    // l'ignore.
    return { url: session.url, sessionId: session.id, paymentReturnUrl };
  }

  /**
   * Expire la session Checkout encore ouverte d'une facture qui n'est plus due.
   *
   * ── Pourquoi ça existe ────────────────────────────────────────────────────
   * Annuler une commande relâche le stock et passe la facture en VOID, mais ne
   * touche pas à Stripe : la session reste PAYABLE. Un onglet laissé ouvert
   * suffit alors à encaisser pour une commande annulée. L'argent tombe sur le
   * compte du club, aucun Payment n'est créé (la facture n'est plus OPEN) —
   * `applyStripePaymentSuccess` le journalise en ENCAISSEMENT ORPHELIN — et il
   * faut rembourser à la main. Expirer la session ferme la porte en amont.
   *
   * ── Best-effort ASSUMÉ, mais jamais muet ──────────────────────────────────
   * L'appel est un effet de bord distant qui peut échouer (Stripe indisponible,
   * session déjà consommée). Il ne doit donc JAMAIS faire échouer l'annulation
   * elle-même, qui est la garantie : le stock doit être relâché même si Stripe
   * ne répond pas (cf. pitfall garantie-derriere-effet-de-bord). D'où : appelé
   * APRÈS commit, ne lève jamais.
   *
   * « Ne lève jamais » n'est pas « se tait » : chaque échec est journalisé, et
   * le cas « session déjà complétée » est signalé à part car il signifie que de
   * l'argent est probablement déjà tombé (cf. pitfall
   * echec-silencieux-chemin-erreur).
   *
   * @returns ce qui s'est réellement passé — testable, contrairement à un void.
   */
  async expireCheckoutSessionForInvoice(
    clubId: string,
    invoiceId: string,
  ): Promise<'expired' | 'none' | 'already-consumed' | 'failed'> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      select: { stripeCheckoutSessionId: true, stripeCheckoutAccountId: true },
    });
    const sessionId = invoice?.stripeCheckoutSessionId;
    const stripeAccount = invoice?.stripeCheckoutAccountId;
    // Aucune session ouverte pour cette facture (paiement sur place, facture
    // jamais présentée à Stripe) : rien à fermer, ce n'est pas un échec.
    if (!sessionId || !stripeAccount) return 'none';

    const stripe = this.getStripe();
    try {
      // On LIT l'état avant d'agir, plutôt que de tenter l'expiration et de
      // deviner la cause du refus : Stripe n'expire que les sessions `open`,
      // et le code d'erreur renvoyé sinon n'est pas un contrat stable. Lire le
      // statut permet en prime de distinguer le cas qui coûte de l'argent
      // (`payment_status === 'paid'`) de la simple expiration naturelle.
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        stripeAccount,
      });
      if (session.status !== 'open') {
        if (session.payment_status === 'paid') {
          // Le cas qui coûte : l'adhérent a payé une facture qui n'est plus
          // due. Aucun Payment ne sera créé (facture non OPEN) — le webhook le
          // journalise en ENCAISSEMENT ORPHELIN. On le redit ici, au moment de
          // l'annulation, pour que les deux bouts du problème soient tracés.
          this.logger.error(
            `[stripe] Session ${sessionId} de la facture ${invoiceId} (club ${clubId}) ` +
              `déjà PAYÉE au moment de l'annulation — un remboursement est dû. ` +
              `Compte connecté ${stripeAccount}.`,
          );
        }
        return 'already-consumed';
      }
      await stripe.checkout.sessions.expire(sessionId, { stripeAccount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[stripe] Échec de l'expiration de la session ${sessionId} ` +
          `(facture ${invoiceId}, club ${clubId}) : ${message}. La session reste ` +
          `PAYABLE — encaissement possible sur une facture qui n'est plus due.`,
      );
      return 'failed';
    }

    // Session bien close : on efface la trace pour ne pas retenter une session
    // morte au prochain passage.
    await this.prisma.invoice.updateMany({
      where: { id: invoiceId, clubId },
      data: { stripeCheckoutSessionId: null, stripeCheckoutAccountId: null },
    });
    return 'expired';
  }
}
