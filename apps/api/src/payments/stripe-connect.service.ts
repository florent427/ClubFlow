import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pilote les comptes Stripe Connect **Express** des clubs (cf. ADR-0008).
 *
 * Modèle retenu : *direct charges*. Chaque club encaisse sur SON compte
 * connecté (`acct_xxx`) — l'argent ne transite jamais par la plateforme,
 * ce qui évite à ClubFlow l'encaissement pour compte de tiers.
 *
 * Ce service parle à Stripe avec la clé **plateforme** : c'est elle qui
 * crée et administre les comptes connectés. Les encaissements, eux, sont
 * exécutés « au nom de » un compte connecté via l'option `{ stripeAccount }`
 * (voir `StripeCheckoutService`).
 */
@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Client Stripe de la plateforme. Throw explicite si non configuré. */
  private getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new BadRequestException(
        'Paiement en ligne indisponible : STRIPE_SECRET_KEY non configurée.',
      );
    }
    return new Stripe(key);
  }

  private adminBaseUrl(): string {
    return (
      process.env.ADMIN_WEB_ORIGIN_PRIMARY ??
      process.env.ADMIN_WEB_ORIGIN?.split(',')[0]?.trim() ??
      'http://localhost:5173'
    );
  }

  /**
   * Crée le compte connecté Express du club s'il n'en a pas encore, et
   * renvoie son `acct_xxx`. Idempotent : si le club a déjà un compte, on le
   * réutilise (ne JAMAIS en recréer un, on perdrait l'historique Stripe).
   */
  async ensureConnectedAccount(clubId: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true, contactEmail: true, stripeAccountId: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');
    if (club.stripeAccountId) return club.stripeAccountId;

    const stripe = this.getStripe();
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'FR',
      email: club.contactEmail ?? undefined,
      // On ne force pas `business_type` : l'onboarding hébergé le collecte
      // (association loi 1901, société…), avec les justificatifs adéquats.
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: { name: club.name },
      metadata: { clubId: club.id },
    });

    await this.prisma.club.update({
      where: { id: club.id },
      data: { stripeAccountId: account.id },
    });
    this.logger.log(`[connect] compte Express créé ${account.id} pour club ${club.id}`);
    return account.id;
  }

  /**
   * Lien d'onboarding hébergé par Stripe (KYC, RIB, justificatifs).
   * À usage unique et courte durée : ne jamais le stocker, le régénérer à
   * chaque fois que l'admin clique.
   */
  async createOnboardingLink(clubId: string): Promise<string> {
    const accountId = await this.ensureConnectedAccount(clubId);
    const stripe = this.getStripe();
    const base = this.adminBaseUrl();
    const link = await stripe.accountLinks.create({
      account: accountId,
      // `refresh_url` : Stripe y renvoie si le lien a expiré → on relance
      // simplement une nouvelle session d'onboarding.
      refresh_url: `${base}/settings/payments?stripe=refresh`,
      return_url: `${base}/settings/payments?stripe=return`,
      type: 'account_onboarding',
    });
    return link.url;
  }

  /**
   * Lien vers le tableau de bord Express du club (voir ses paiements et
   * ses virements côté Stripe).
   */
  async createDashboardLink(clubId: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { stripeAccountId: true },
    });
    if (!club?.stripeAccountId) {
      throw new BadRequestException(
        "Ce club n'a pas encore de compte Stripe connecté.",
      );
    }
    const stripe = this.getStripe();
    const link = await stripe.accounts.createLoginLink(club.stripeAccountId);
    return link.url;
  }

  /**
   * Interroge Stripe et met à jour le miroir local des capacités.
   * Utile après un retour d'onboarding, sans attendre le webhook.
   */
  async refreshAccountStatus(clubId: string): Promise<{
    stripeAccountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { stripeAccountId: true },
    });
    if (!club?.stripeAccountId) {
      throw new BadRequestException(
        "Ce club n'a pas encore de compte Stripe connecté.",
      );
    }
    const stripe = this.getStripe();
    const account = await stripe.accounts.retrieve(club.stripeAccountId);
    await this.applyAccountUpdated(account);
    return {
      stripeAccountId: account.id,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
    };
  }

  /**
   * Applique l'état d'un compte connecté au miroir local. Appelé par le
   * webhook `account.updated` et par `refreshAccountStatus`.
   *
   * Rattache par `stripeAccountId` (et non par metadata) : c'est la clé
   * unique côté base, et elle reste valide même si les metadata sont
   * modifiées côté Stripe.
   */
  async applyAccountUpdated(account: Stripe.Account): Promise<void> {
    const club = await this.prisma.club.findFirst({
      where: { stripeAccountId: account.id },
      select: { id: true, stripeOnboardedAt: true },
    });
    if (!club) {
      this.logger.warn(
        `[connect] account.updated reçu pour ${account.id} — aucun club rattaché`,
      );
      return;
    }
    const chargesEnabled = account.charges_enabled === true;
    await this.prisma.club.update({
      where: { id: club.id },
      data: {
        stripeChargesEnabled: chargesEnabled,
        stripePayoutsEnabled: account.payouts_enabled === true,
        stripeDetailsSubmitted: account.details_submitted === true,
        // Posé une seule fois, au premier passage en "encaissable".
        ...(chargesEnabled && !club.stripeOnboardedAt
          ? { stripeOnboardedAt: new Date() }
          : {}),
      },
    });
  }

  /**
   * Renvoie le compte connecté utilisable pour encaisser, ou throw avec un
   * message actionnable. Volontairement STRICT : pas de repli sur le compte
   * plateforme (cf. ADR-0008) — mieux vaut refuser le paiement que de faire
   * atterrir l'argent d'un club chez ClubFlow.
   */
  async requireChargeableAccount(clubId: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { stripeAccountId: true, stripeChargesEnabled: true },
    });
    if (!club?.stripeAccountId) {
      throw new BadRequestException(
        "Paiement en ligne indisponible : le club n'a pas encore connecté son compte Stripe.",
      );
    }
    if (!club.stripeChargesEnabled) {
      throw new BadRequestException(
        "Paiement en ligne indisponible : l'inscription Stripe du club n'est pas finalisée.",
      );
    }
    return club.stripeAccountId;
  }
}
