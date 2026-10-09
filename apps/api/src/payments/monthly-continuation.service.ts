import { Injectable, Logger } from '@nestjs/common';
import {
  InvoiceLineKind,
  InvoicePurpose,
  InvoiceStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
  Prisma,
  SubscriptionBillingRhythm,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEDULING_TIMEZONE } from '../scheduling/scheduling.constants';
import {
  buildMonthlyContinuationPlan,
  continuationLabel,
  dateInZone,
  firstCoveredMonth,
  monthlyConsentText,
  remainingMonths,
  type YearMonth,
} from './monthly-continuation-plan';
import { PaymentScheduleNotifierService } from './payment-schedule-notifier.service';
import type { PlannedInstallment } from './payment-schedule-plan';

/** Carte enregistrée au paiement de l'adhésion, réutilisable hors session. */
export type SavedCard = {
  stripeAccountId: string;
  customerId: string;
  paymentMethodId: string;
};

/** Ce que la suite d'une adhésion facturerait — ou pourquoi elle n'existe pas. */
export type ContinuationPlan =
  | {
      kind: 'plan';
      source: { id: string; label: string };
      monthlyCents: number;
      months: YearMonth[];
      installments: PlannedInstallment[];
      totalCents: number;
    }
  | { kind: 'none'; reason: string };

export type ContinuationOutcome =
  | { kind: 'created'; invoiceId: string; scheduleId: string; active: boolean }
  | { kind: 'existing'; invoiceId: string }
  | { kind: 'none'; reason: string };

const sourceInclude = {
  clubSeason: { select: { startsOn: true, endsOn: true } },
  monthlyContinuation: { select: { id: true } },
  creditNotes: {
    where: { isCreditNote: true, status: { not: InvoiceStatus.VOID } },
    select: { id: true },
  },
  lines: {
    where: {
      kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
      subscriptionBillingRhythm: SubscriptionBillingRhythm.MONTHLY,
    },
    orderBy: { sortOrder: 'asc' },
    include: { adjustments: { select: { amountCents: true } } },
  },
} satisfies Prisma.InvoiceInclude;

type SourceInvoice = Prisma.InvoiceGetPayload<{ include: typeof sourceInclude }>;

/**
 * Suite des cotisations au rythme mensuel.
 *
 * La facture d'adhésion d'une cotisation mensuelle ne porte que le premier
 * mois. Sans suite, les mois suivants ne sont jamais réclamés. La suite est
 * une seconde facture — les mois restants de la saison — réglée par un
 * échéancier carte prélevé le 10 de chaque mois par le moteur existant
 * (ADR-0009) : retries, alertes et contrôle du solde viennent avec.
 *
 * Deux chemins la créent :
 *  - le webhook du paiement de l'adhésion, avec la carte que Checkout vient
 *    d'enregistrer : l'échéancier naît prélevable ;
 *  - le rattrapage admin, pour les adhésions payées avant que la carte ne soit
 *    enregistrée (ou réglées au club) : l'échéancier naît en attente de carte,
 *    et l'adhérent l'enregistre depuis son portail.
 */
@Injectable()
export class MonthlyContinuationService {
  private readonly logger = new Logger(MonthlyContinuationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: PaymentScheduleNotifierService,
  ) {}

  /**
   * Plan de la suite d'une facture d'adhésion.
   *
   * `requirePaid: false` sert à la page de paiement, qui doit annoncer les
   * mensualités AVANT que l'adhésion soit payée.
   */
  async planFor(
    clubId: string,
    invoiceId: string,
    opts: { now?: Date; requirePaid?: boolean } = {},
  ): Promise<ContinuationPlan> {
    const source = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      include: sourceInclude,
    });
    if (!source) return { kind: 'none', reason: 'facture introuvable' };
    return this.planFromSource(source, opts.now ?? new Date(), {
      requirePaid: opts.requirePaid ?? true,
    });
  }

  private planFromSource(
    source: SourceInvoice,
    now: Date,
    opts: { requirePaid: boolean },
  ): ContinuationPlan {
    if (source.isCreditNote || source.purpose !== InvoicePurpose.CHARGE) {
      return { kind: 'none', reason: 'pas une facture d’adhésion' };
    }
    // Une suite ne se prolonge pas : elle couvre déjà la fin de saison.
    if (source.monthlyContinuationOfId) {
      return { kind: 'none', reason: 'facture de mensualités' };
    }
    const allowed: InvoiceStatus[] = opts.requirePaid
      ? [InvoiceStatus.PAID]
      : [InvoiceStatus.OPEN, InvoiceStatus.PAID];
    if (!allowed.includes(source.status)) {
      return { kind: 'none', reason: 'adhésion pas encore payée' };
    }
    if (source.lines.length === 0) {
      return { kind: 'none', reason: 'aucune cotisation mensuelle' };
    }
    if (!source.clubSeason) {
      return { kind: 'none', reason: 'facture sans saison' };
    }
    // Un avoir sur l'adhésion veut dire qu'elle a été corrigée ou remboursée :
    // en déduire des mensualités serait deviner. Le trésorier tranche.
    if (source.creditNotes.length > 0) {
      return { kind: 'none', reason: 'avoir émis sur l’adhésion' };
    }

    // La mensualité est celle que l'adhérent paie réellement : prix mensuel
    // de la formule, remises comprises (famille, exceptionnelle).
    const lineMonthly = source.lines.map(
      (l) =>
        l.baseAmountCents +
        l.adjustments.reduce((sum, a) => sum + a.amountCents, 0),
    );
    if (lineMonthly.some((c) => c <= 0)) {
      return { kind: 'none', reason: 'cotisation mensuelle offerte' };
    }
    const monthlyCents = lineMonthly.reduce((a, b) => a + b, 0);

    const months = remainingMonths({
      firstCovered: firstCoveredMonth({
        seasonStartsOn: source.clubSeason.startsOn,
        // Le mois couvert est celui de l'ADHÉSION, pas du paiement : une
        // adhésion de septembre réglée en octobre doit toujours septembre.
        adheredAt: source.createdAt,
        timeZone: SCHEDULING_TIMEZONE,
      }),
      seasonEndsOn: source.clubSeason.endsOn,
    });
    if (months.length === 0) {
      return { kind: 'none', reason: 'saison terminée après le mois payé' };
    }
    // Une saison close ne se réclame plus : tous ses mois tomberaient dus
    // d'un coup, pour une activité que l'adhérent ne peut plus suivre.
    const today = dateInZone(now, SCHEDULING_TIMEZONE);
    const seasonEnd = source.clubSeason.endsOn;
    if (
      Date.UTC(today.year, today.month, today.day) >
      Date.UTC(
        seasonEnd.getUTCFullYear(),
        seasonEnd.getUTCMonth(),
        seasonEnd.getUTCDate(),
      )
    ) {
      return { kind: 'none', reason: 'saison terminée' };
    }

    const installments = buildMonthlyContinuationPlan({
      monthlyCents,
      months,
      today,
    });
    return {
      kind: 'plan',
      source: { id: source.id, label: source.label },
      monthlyCents,
      months,
      installments,
      totalCents: monthlyCents * months.length,
    };
  }

  /**
   * Texte d'accord pour la page de paiement de l'adhésion, ou `null` si la
   * facture n'a pas de suite mensuelle (rien à enregistrer).
   */
  async consentForCheckout(
    clubId: string,
    invoiceId: string,
    clubName: string,
    now: Date = new Date(),
  ): Promise<string | null> {
    const plan = await this.planFor(clubId, invoiceId, {
      now,
      requirePaid: false,
    });
    if (plan.kind !== 'plan') return null;
    const today = dateInZone(now, SCHEDULING_TIMEZONE);
    return monthlyConsentText({
      clubName,
      monthlyCents: plan.monthlyCents,
      months: plan.months,
      today,
    });
  }

  /**
   * Crée la suite d'une adhésion payée. Idempotent : une adhésion n'a qu'une
   * suite (`monthlyContinuationOfId` unique), un second appel la retrouve.
   */
  async createFor(
    clubId: string,
    invoiceId: string,
    opts: { now?: Date; card?: SavedCard | null } = {},
  ): Promise<ContinuationOutcome> {
    const source = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId },
      include: sourceInclude,
    });
    if (!source) return { kind: 'none', reason: 'facture introuvable' };
    if (source.monthlyContinuation) {
      return { kind: 'existing', invoiceId: source.monthlyContinuation.id };
    }
    const plan = this.planFromSource(source, opts.now ?? new Date(), {
      requirePaid: true,
    });
    if (plan.kind !== 'plan') return plan;

    const card = opts.card ?? null;
    const n = plan.months.length;
    const payerLabel = source.label.split(' — ').slice(1).join(' — ') || null;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            clubId,
            familyId: source.familyId,
            householdGroupId: source.householdGroupId,
            clubSeasonId: source.clubSeasonId,
            label: continuationLabel({ months: plan.months, payerLabel }),
            baseAmountCents: plan.totalCents,
            amountCents: plan.totalCents,
            status: InvoiceStatus.OPEN,
            installmentsCount: n,
            monthlyContinuationOfId: source.id,
            lines: {
              create: source.lines.map((l, i) => ({
                kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
                memberId: l.memberId,
                membershipProductId: l.membershipProductId,
                subscriptionBillingRhythm: SubscriptionBillingRhythm.MONTHLY,
                dynamicGroupId: l.dynamicGroupId,
                // Remises déjà comprises : la ligne porte ce qui est dû.
                baseAmountCents:
                  (l.baseAmountCents +
                    l.adjustments.reduce((s, a) => s + a.amountCents, 0)) *
                  n,
                sortOrder: i,
              })),
            },
          },
        });
        const schedule = await tx.paymentSchedule.create({
          data: {
            clubId,
            invoiceId: invoice.id,
            method: PaymentScheduleMethod.CARD,
            // Avec la carte de l'adhésion, l'échéancier est prélevable tout de
            // suite ; sans elle, il attend que l'adhérent l'enregistre.
            status: card
              ? PaymentScheduleStatus.ACTIVE
              : PaymentScheduleStatus.PENDING_SETUP,
            totalCents: plan.totalCents,
            installmentCount: n,
            stripeAccountId: card?.stripeAccountId ?? null,
            stripeCustomerId: card?.customerId ?? null,
            stripePaymentMethodId: card?.paymentMethodId ?? null,
            installments: {
              create: plan.installments.map((p) => ({
                clubId,
                seq: p.seq,
                dueOn: p.dueOn,
                amountCents: p.amountCents,
              })),
            },
          },
        });
        return { invoiceId: invoice.id, scheduleId: schedule.id };
      });
      this.logger.log(
        `[mensualites] adhésion ${source.id} : suite ${created.invoiceId} ` +
          `(${n} × ${plan.monthlyCents} cts, ${card ? 'carte enregistrée' : 'carte à enregistrer'})`,
      );
      return { kind: 'created', ...created, active: card != null };
    } catch (err) {
      // Deux livraisons concurrentes du même webhook : l'autre a gagné.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.invoice.findUnique({
          where: { monthlyContinuationOfId: source.id },
          select: { id: true },
        });
        if (existing) return { kind: 'existing', invoiceId: existing.id };
      }
      throw err;
    }
  }

  /**
   * Rattrapage : les adhésions mensuelles payées du club qui n'ont pas encore
   * de suite. `dryRun` liste ce qui serait créé sans rien écrire.
   *
   * `notify` envoie au payeur l'invitation à enregistrer sa carte, pour chaque
   * suite créée sans carte : sans elle, la famille ne sait pas qu'elle doit
   * agir, et rien n'est prélevé. Volontairement explicite — ce sont des
   * courriers envoyés aux familles.
   */
  async ensureForClub(
    clubId: string,
    opts: { dryRun: boolean; notify?: boolean; now?: Date },
  ): Promise<
    Array<{
      sourceInvoiceId: string;
      sourceLabel: string;
      plan: ContinuationPlan;
      outcome: ContinuationOutcome | null;
      notified: boolean;
    }>
  > {
    const now = opts.now ?? new Date();
    const sources = await this.prisma.invoice.findMany({
      where: {
        clubId,
        status: InvoiceStatus.PAID,
        isCreditNote: false,
        monthlyContinuationOfId: null,
        monthlyContinuation: { is: null },
        lines: {
          some: {
            kind: InvoiceLineKind.MEMBERSHIP_SUBSCRIPTION,
            subscriptionBillingRhythm: SubscriptionBillingRhythm.MONTHLY,
          },
        },
      },
      include: sourceInclude,
      orderBy: { createdAt: 'asc' },
    });

    const rows = [];
    for (const source of sources) {
      const plan = this.planFromSource(source, now, { requirePaid: true });
      const outcome =
        opts.dryRun || plan.kind !== 'plan'
          ? null
          : await this.createFor(clubId, source.id, { now });
      const notified =
        opts.notify === true &&
        outcome?.kind === 'created' &&
        !outcome.active
          ? await this.notifier.notifyMonthlyCardSetup(outcome.scheduleId)
          : false;
      rows.push({
        sourceInvoiceId: source.id,
        sourceLabel: source.label,
        plan,
        outcome,
        notified,
      });
    }
    return rows;
  }

  /**
   * Relance les payeurs dont la suite mensuelle attend encore la carte.
   * `dryRun` compte sans rien envoyer.
   *
   * @returns les échéanciers concernés, et ceux dont le courrier est parti.
   */
  async remindPendingCardSetup(
    clubId: string,
    opts: { dryRun: boolean },
  ): Promise<{ pending: number; sent: number }> {
    const schedules = await this.prisma.paymentSchedule.findMany({
      where: {
        clubId,
        status: PaymentScheduleStatus.PENDING_SETUP,
        invoice: {
          status: InvoiceStatus.OPEN,
          monthlyContinuationOfId: { not: null },
        },
      },
      select: { id: true },
    });
    let sent = 0;
    if (!opts.dryRun) {
      for (const s of schedules) {
        if (await this.notifier.notifyMonthlyCardSetup(s.id, { reminder: true })) {
          sent += 1;
        }
      }
    }
    return { pending: schedules.length, sent };
  }
}
