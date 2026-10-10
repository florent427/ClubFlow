import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULING_TIMEZONE } from '../scheduling/scheduling.constants';
import { resolveInvoiceBalance } from './invoice-balance';
import { dateInZone } from './monthly-continuation-plan';
import { buildSetupNotice } from './payment-schedule-notice';
import {
  buildInstallmentPlan,
  SEPA_PRENOTIFICATION_DAYS,
} from './payment-schedule-plan';
import { PaymentScheduleNotifierService } from './payment-schedule-notifier.service';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Échéancier de paiement (cf. ADR-0009) — lot 2 : création du plan et
 * enregistrement du moyen de paiement réutilisable.
 *
 * Le prélèvement effectif des échéances est le lot 3 ; ce service s'arrête
 * au moment où l'échéancier devient ACTIVE, c'est-à-dire prélevable.
 */
@Injectable()
export class PaymentScheduleService {
  private readonly logger = new Logger(PaymentScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connect: StripeConnectService,
    private readonly notifier: PaymentScheduleNotifierService,
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

  private portalBaseUrl(): string {
    const raw = process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
    // MEMBER_PORTAL_ORIGIN peut contenir une liste séparée par des virgules
    // et/ou un slash final : on ne garde que la première origine, nettoyée.
    return raw.split(',')[0]!.trim().replace(/\/+$/, '');
  }

  /**
   * Crée l'échéancier d'une facture ouverte et son plan d'échéances.
   *
   * L'échéancier naît en PENDING_SETUP : il n'est pas prélevable tant qu'un
   * moyen de paiement n'a pas été enregistré (`startSetup` puis retour du
   * webhook).
   */
  async createForInvoice(args: {
    clubId: string;
    invoiceId: string;
    method: PaymentScheduleMethod;
    installmentCount: number;
    firstDueOn?: Date;
    intervalMonths?: number;
  }) {
    // Le virement mensuel se choisit sur un échéancier existant
    // (`chooseMonthlyTransfer`) : créé ici, il naîtrait en attente d'un moyen
    // de paiement qui ne viendra jamais, et serait relancé à tort.
    if (args.method === PaymentScheduleMethod.MANUAL_TRANSFER) {
      throw new BadRequestException(
        'Le virement mensuel se choisit sur un échéancier existant.',
      );
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: args.invoiceId, clubId: args.clubId },
      include: { paymentSchedule: true },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    if (invoice.status !== InvoiceStatus.OPEN) {
      throw new BadRequestException(
        'Seule une facture ouverte peut être échelonnée.',
      );
    }
    if (invoice.paymentSchedule) {
      throw new BadRequestException(
        'Cette facture a déjà un échéancier. Annulez-le avant d’en créer un autre.',
      );
    }

    // On échelonne ce qui reste RÉCLAMABLE, pas le montant total : un acompte a
    // pu être encaissé, ou un avoir émis (ADR-0011), avant la mise en place de
    // l'échéancier. C'est le calcul que refait le moteur avant chaque
    // prélèvement : un plan bâti sur un autre total annoncerait à l'adhérent —
    // et, en SEPA, dans l'avis de prélèvement — des échéances que le moteur ne
    // prélèverait pas.
    const { collectableCents } = await resolveInvoiceBalance(
      this.prisma,
      invoice.id,
      args.clubId,
    );
    if (collectableCents <= 0) {
      throw new BadRequestException('Cette facture est déjà soldée.');
    }

    // SEPA : le schéma impose d'informer le débiteur AVANT de prélever. L'avis
    // part à la signature du mandat ; on décale donc la première échéance pour
    // qu'il la précède réellement — sans ce délai, un mandat signé le matin
    // pourrait être prélevé dès le lendemain et l'avis n'aurait servi à rien.
    const requestedFirstDue = args.firstDueOn ?? new Date();
    const firstDueOn =
      args.method === PaymentScheduleMethod.SEPA_DEBIT
        ? new Date(
            Math.max(
              requestedFirstDue.getTime(),
              Date.now() + SEPA_PRENOTIFICATION_DAYS * 86_400_000,
            ),
          )
        : requestedFirstDue;

    const plan = buildInstallmentPlan({
      totalCents: collectableCents,
      count: args.installmentCount,
      firstDueOn,
      intervalMonths: args.intervalMonths,
    });

    return this.prisma.paymentSchedule.create({
      data: {
        clubId: args.clubId,
        invoiceId: invoice.id,
        method: args.method,
        status: PaymentScheduleStatus.PENDING_SETUP,
        totalCents: collectableCents,
        installmentCount: plan.length,
        installments: {
          create: plan.map((p) => ({
            clubId: args.clubId,
            seq: p.seq,
            dueOn: p.dueOn,
            amountCents: p.amountCents,
          })),
        },
      },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
  }

  /**
   * Ouvre le parcours d'enregistrement du moyen de paiement.
   *
   * Utilise `mode: 'setup'` : aucun euro n'est débité ici. L'intérêt est que
   * l'authentification forte (3-D Secure pour la carte, signature du mandat
   * pour le SEPA) a lieu pendant que l'adhérent est devant son écran — ce qui
   * autorise ensuite les prélèvements off-session.
   */
  async startSetup(
    clubId: string,
    scheduleId: string,
  ): Promise<{ url: string; sessionId: string }> {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, clubId },
      include: {
        invoice: { include: { club: { select: { name: true } } } },
        installments: { orderBy: { seq: 'asc' } },
      },
    });
    if (!schedule) throw new NotFoundException('Échéancier introuvable.');
    if (schedule.status === PaymentScheduleStatus.CANCELLED) {
      throw new BadRequestException('Cet échéancier a été annulé.');
    }

    // Direct charges : le Customer et le moyen de paiement doivent vivre sur
    // le compte connecté du club (ADR-0008), jamais sur la plateforme.
    const stripeAccount = await this.connect.requireChargeableAccount(clubId);
    const stripe = this.getStripe();

    const customerId =
      schedule.stripeCustomerId ??
      (await this.createCustomer(stripe, stripeAccount, schedule.id, clubId));

    const local = dateInZone(new Date(), SCHEDULING_TIMEZONE);
    const setupNotice = buildSetupNotice({
      clubName: schedule.invoice.club.name,
      // Un virement mensuel qui passe à la carte s'annonce comme une carte.
      method:
        schedule.method === PaymentScheduleMethod.SEPA_DEBIT
          ? PaymentScheduleMethod.SEPA_DEBIT
          : PaymentScheduleMethod.CARD,
      installments: schedule.installments,
      today: new Date(Date.UTC(local.year, local.month, local.day)),
    });

    const base = this.portalBaseUrl();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'setup',
        customer: customerId,
        payment_method_types:
          schedule.method === PaymentScheduleMethod.SEPA_DEBIT
            ? ['sepa_debit']
            : ['card'],
        // Retrouvé au retour du webhook pour rattacher le moyen de paiement.
        metadata: {
          scheduleId: schedule.id,
          clubId,
          invoiceId: schedule.invoiceId,
        },
        setup_intent_data: {
          metadata: {
            scheduleId: schedule.id,
            clubId,
            invoiceId: schedule.invoiceId,
          },
        },
        ...(setupNotice ? { custom_text: { submit: { message: setupNotice } } } : {}),
        success_url: `${base}/facturation?echeancier=ok`,
        cancel_url: `${base}/facturation?echeancier=annule`,
      },
      { stripeAccount },
    );

    if (!session.url) {
      throw new BadRequestException(
        "Impossible d'ouvrir l'enregistrement du moyen de paiement.",
      );
    }

    await this.prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: { stripeCustomerId: customerId, stripeAccountId: stripeAccount },
    });

    return { url: session.url, sessionId: session.id };
  }

  /**
   * La famille choisit de régler ses échéances par virement, chaque mois,
   * au lieu d'enregistrer sa carte.
   *
   * L'échéancier devient ACTIVE en MANUAL_TRANSFER : le moteur ne le prélève
   * plus, les relances de carte ne le visent plus, et chaque virement saisi
   * par le club solde l'échéance la plus ancienne. Un échéancier déjà payé
   * par carte peut aussi passer au virement ; la carte reste enregistrée mais
   * n'est plus débitée.
   */
  async chooseMonthlyTransfer(clubId: string, scheduleId: string) {
    const schedule = await this.prisma.paymentSchedule.findFirst({
      where: { id: scheduleId, clubId },
    });
    if (!schedule) throw new NotFoundException('Échéancier introuvable.');
    if (
      schedule.status !== PaymentScheduleStatus.PENDING_SETUP &&
      schedule.status !== PaymentScheduleStatus.ACTIVE
    ) {
      throw new BadRequestException('Cet échéancier est terminé ou annulé.');
    }
    if (schedule.method === PaymentScheduleMethod.SEPA_DEBIT) {
      throw new BadRequestException(
        'Un mandat de prélèvement est en place : contactez le club pour le changer.',
      );
    }
    const updated = await this.prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        method: PaymentScheduleMethod.MANUAL_TRANSFER,
        status: PaymentScheduleStatus.ACTIVE,
      },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
    this.logger.log(`[echeancier] ${schedule.id} : virement mensuel choisi`);
    return updated;
  }

  /**
   * Coordonnées du virement mensuel : compte bancaire du club (le compte par
   * défaut d'abord), et une référence courte que le club retrouve sur son
   * relevé — le début de l'identifiant de la facture, affiché aussi dans la
   * liste des factures de l'admin.
   */
  async transferInstructions(clubId: string, invoiceId: string) {
    const [club, account] = await Promise.all([
      this.prisma.club.findUnique({ where: { id: clubId }, select: { name: true } }),
      this.prisma.clubFinancialAccount.findFirst({
        where: { clubId, kind: 'BANK', isActive: true, iban: { not: null } },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        select: { iban: true, bic: true },
      }),
    ]);
    return {
      beneficiary: club?.name ?? '',
      iban: account?.iban ?? null,
      bic: account?.bic ?? null,
      reference: `COTIS-${invoiceId.slice(0, 8).toUpperCase()}`,
    };
  }

  /** Crée le Customer sur le compte connecté et le mémorise. */
  private async createCustomer(
    stripe: Stripe,
    stripeAccount: string,
    scheduleId: string,
    clubId: string,
  ): Promise<string> {
    const customer = await stripe.customers.create(
      { metadata: { scheduleId, clubId } },
      { stripeAccount },
    );
    return customer.id;
  }

  /**
   * Rattache le moyen de paiement enregistré et rend l'échéancier prélevable.
   * Appelé depuis le webhook à la fin du parcours de setup.
   *
   * Idempotent : rejouer le même événement ne change rien une fois
   * l'échéancier ACTIVE.
   */
  async applySetupCompleted(args: {
    scheduleId: string;
    stripeAccountId: string;
    paymentMethodId: string;
    mandateReference?: string | null;
  }): Promise<void> {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: args.scheduleId },
    });
    if (!schedule) {
      this.logger.warn(
        `[echeancier] setup terminé pour ${args.scheduleId} — échéancier introuvable`,
      );
      return;
    }
    // Garde-fou multi-tenant : le compte émetteur doit être celui du club.
    if (
      schedule.stripeAccountId &&
      schedule.stripeAccountId !== args.stripeAccountId
    ) {
      this.logger.warn(
        `[echeancier] setup reçu du compte ${args.stripeAccountId} ` +
          `mais l'échéancier ${schedule.id} est rattaché à ${schedule.stripeAccountId} — ignoré.`,
      );
      return;
    }
    if (schedule.status === PaymentScheduleStatus.CANCELLED) return;

    await this.prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: {
        stripePaymentMethodId: args.paymentMethodId,
        stripeAccountId: args.stripeAccountId,
        status: PaymentScheduleStatus.ACTIVE,
        // La famille qui payait par virement passe à la carte : sans ce
        // changement, le moteur continuerait de l'ignorer.
        ...(schedule.method === PaymentScheduleMethod.MANUAL_TRANSFER
          ? { method: PaymentScheduleMethod.CARD }
          : {}),
        ...(args.mandateReference
          ? {
              sepaMandateReference: args.mandateReference,
              sepaMandateAcceptedAt: new Date(),
            }
          : {}),
      },
    });
    this.logger.log(
      `[echeancier] ${schedule.id} actif — moyen de paiement enregistré`,
    );

    // SEPA : l'avis de prélèvement part maintenant, à la signature du mandat.
    // Il récapitule toutes les échéances, ce qui couvre l'obligation
    // d'information pour l'ensemble de l'échéancier. On trace la date : sans
    // preuve d'envoi, l'obligation n'est pas démontrable.
    if (schedule.method === PaymentScheduleMethod.SEPA_DEBIT) {
      const sent = await this.notifier.notifySepaPreNotification(schedule.id);
      if (sent) {
        await this.prisma.paymentSchedule.update({
          where: { id: schedule.id },
          data: { sepaPreNotifiedAt: new Date() },
        });
      }
    }
  }
}
