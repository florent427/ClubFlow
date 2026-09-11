import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BankStatementFormat, BankStatementLineStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { BankStatementIntegrityService } from '../accounting/bank-import/bank-statement-integrity.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import {
  SCHEDULER_LOCK_KEYS,
  SCHEDULING_TIMEZONE,
} from '../scheduling/scheduling.constants';
import {
  classifyTxn,
  labelForTxn,
  payoutArithmetic,
  type KnownIndex,
  type TransitTxn,
} from './stripe-transit-classify';

/** Au-delà, on ne remonte pas : une première synchro ne relit pas des années. */
const MAX_LOOKBACK_DAYS = 400;
/**
 * On relit toujours deux jours en arrière. Un virement manqué est une
 * divergence silencieuse — précisément ce que ce lot existe pour éviter — et
 * repasser ne coûte qu'un appel : l'écriture est idempotente par
 * `stripePayoutId`, les lignes par leur identifiant de transaction.
 */
const OVERLAP_DAYS = 2;
/** Garde-fou de pagination : un club normal fait quelques virements par mois. */
const MAX_PAYOUTS_PER_RUN = 300;
const PAGE_SIZE = 100;

export interface TransitSyncReport {
  clubId: string;
  /** Renseigné quand il n'y avait rien à faire, et pourquoi. */
  skipped?: string;
  payoutsSeen: number;
  /** Virements dont l'écriture manquait : rattrapés. */
  payoutsRecorded: number;
  /** Transactions que ClubFlow ne connaissait pas, devenues des lignes. */
  unknownLines: number;
  /** Virements dont la somme des transactions ne tombe pas juste. */
  arithmeticWarnings: number;
}

/**
 * Synchronisation du transit Stripe par l'API (ADR-0014, lot 8).
 *
 * Le compte de transit 512300 existe pour rendre DÉTECTABLE la divergence
 * entre ce que ClubFlow croit encaissé et ce que Stripe a réellement versé.
 * Encore faut-il aller regarder : un `payout.paid` manqué, un paiement
 * encaissé depuis le dashboard Stripe, un litige, et le transit dérive sans
 * que rien ne le signale.
 *
 * Ce service va lire chez Stripe, tous les jours, et fait deux choses :
 *
 * 1. **Rattraper** les virements dont l'écriture manque. `recordStripePayout`
 *    est idempotent par `stripePayoutId`, donc repasser ne crée rien.
 * 2. **Rendre visible** ce que ClubFlow ne connaît pas. Chaque transaction
 *    inconnue devient une ligne d'un relevé synthétisé sur le transit, à
 *    catégoriser comme n'importe quelle ligne de relevé bancaire.
 *
 * Comme la récupération des frais, tout est « best effort » : aucune méthode
 * ne relance vers son appelant. Un encaissement acquis ne doit jamais être
 * remis en cause parce que Stripe est lent.
 */
@Injectable()
export class StripeTransitSyncService {
  private readonly logger = new Logger(StripeTransitSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly integrity: BankStatementIntegrityService,
    private readonly lock: SchedulerLockService,
  ) {}

  /** 04:30 à La Réunion : après les virements de la nuit, avant le club. */
  @Cron('30 4 * * *', { timeZone: SCHEDULING_TIMEZONE })
  async dailySync(): Promise<void> {
    if (process.env.STRIPE_TRANSIT_SYNC_DISABLED === 'true') {
      // Bruyant à dessein : un interrupteur d'urgence oublié ne se signale
      // par rien d'autre, et le transit dériverait en silence.
      this.logger.warn(
        '[transit] synchronisation DÉSACTIVÉE par STRIPE_TRANSIT_SYNC_DISABLED.',
      );
      return;
    }
    await this.lock.withLock(SCHEDULER_LOCK_KEYS.stripeTransitSync, 15 * 60_000, async () => {
      const reports = await this.syncAllClubs();
      const worth = reports.filter((r) => !r.skipped);
      if (worth.length > 0) {
        this.logger.log(`[transit] synchro quotidienne : ${JSON.stringify(worth)}`);
      }
    });
  }

  /** Tous les clubs branchés à Stripe, l'un après l'autre. Ne lève jamais. */
  async syncAllClubs(): Promise<TransitSyncReport[]> {
    const clubs = await this.prisma.club.findMany({
      where: { stripeAccountId: { not: null } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const reports: TransitSyncReport[] = [];
    for (const club of clubs) {
      reports.push(await this.syncClub(club.id));
    }
    return reports;
  }

  /** Ne lève jamais : un club en échec ne doit pas arrêter les suivants. */
  async syncClub(clubId: string): Promise<TransitSyncReport> {
    try {
      return await this.syncClubOrThrow(clubId);
    } catch (err) {
      this.logger.error(
        `[transit] club ${clubId} : synchronisation en échec — ${(err as Error).message}`,
      );
      return {
        clubId,
        skipped: 'erreur',
        payoutsSeen: 0,
        payoutsRecorded: 0,
        unknownLines: 0,
        arithmeticWarnings: 0,
      };
    }
  }

  async syncClubOrThrow(clubId: string): Promise<TransitSyncReport> {
    const empty = {
      clubId,
      payoutsSeen: 0,
      payoutsRecorded: 0,
      unknownLines: 0,
      arithmeticWarnings: 0,
    };
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, stripeAccountId: true, accountingStartsOn: true },
    });
    if (!club?.stripeAccountId) return { ...empty, skipped: 'sans compte Stripe' };
    if (!(await this.accounting.isAccountingEnabled(clubId))) {
      return { ...empty, skipped: 'module comptabilité inactif' };
    }
    if (!club.accountingStartsOn) {
      // Sans date de reprise, on ne sait pas où s'arrêter de remonter, et on
      // écrirait des mouvements antérieurs à la comptabilité du club.
      return { ...empty, skipped: 'date de reprise non renseignée' };
    }
    const transit = await this.prisma.clubFinancialAccount.findFirst({
      where: { clubId, kind: 'STRIPE_TRANSIT' },
      include: { accountingAccount: true },
    });
    if (!transit) return { ...empty, skipped: 'sans compte de transit' };

    const stripe = this.getStripe();
    if (!stripe) return { ...empty, skipped: 'STRIPE_SECRET_KEY absente' };

    const since = this.lookbackFrom(transit.stripeSyncedAt, club.accountingStartsOn);
    const payouts = await this.listPayouts(stripe, club.stripeAccountId, since);
    const report: TransitSyncReport = { ...empty, payoutsSeen: payouts.length };

    const startedAt = new Date();
    for (const payout of payouts) {
      if (payout.status !== 'paid') continue;
      const arrivedAt = new Date(payout.arrival_date * 1000);

      const before = await this.prisma.accountingEntry.count({
        where: { clubId, stripePayoutId: payout.id },
      });
      await this.accounting.recordStripePayout({
        clubId,
        payoutId: payout.id,
        amountCents: payout.amount,
        occurredAt: arrivedAt,
      });
      if (before === 0) {
        const after = await this.prisma.accountingEntry.count({
          where: { clubId, stripePayoutId: payout.id },
        });
        if (after > 0) report.payoutsRecorded += 1;
      }

      const txns = await this.listTxnsOfPayout(stripe, club.stripeAccountId, payout.id);
      const arithmetic = payoutArithmetic(payout.amount, txns);
      if (!arithmetic.ok) {
        // L'écart ne vient pas d'une écriture fausse : il vient de ce qu'on
        // n'a pas tout lu. On le dit et on continue.
        report.arithmeticWarnings += 1;
        this.logger.warn(
          `[transit] club ${clubId} virement ${payout.id} : ${arithmetic.sumCents} c de transactions pour ${payout.amount} c versés (écart ${arithmetic.deltaCents} c).`,
        );
      }

      const known = await this.knownIndex(clubId, txns);
      const unknown = txns.filter((t) => classifyTxn(t, known) === 'UNKNOWN');
      if (unknown.length > 0) {
        report.unknownLines += await this.recordUnknown(clubId, transit.id, unknown);
      }
    }

    await this.prisma.clubFinancialAccount.update({
      where: { id: transit.id },
      data: { stripeSyncedAt: startedAt },
    });
    return report;
  }

  // ── Stripe ─────────────────────────────────────────────────────────────

  /**
   * Renvoie `null` plutôt que de lever si la clé manque : l'absence de
   * configuration Stripe ne doit pas faire échouer un balayage nocturne.
   */
  private getStripe(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      this.logger.warn('[transit] STRIPE_SECRET_KEY absente — synchro impossible.');
      return null;
    }
    return new Stripe(key);
  }

  private async listPayouts(
    stripe: Stripe,
    stripeAccount: string,
    since: Date,
  ): Promise<Stripe.Payout[]> {
    const out: Stripe.Payout[] = [];
    let startingAfter: string | undefined;
    while (out.length < MAX_PAYOUTS_PER_RUN) {
      const page = await stripe.payouts.list(
        {
          limit: PAGE_SIZE,
          arrival_date: { gte: Math.floor(since.getTime() / 1000) },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        { stripeAccount },
      );
      out.push(...page.data);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
    return out;
  }

  /**
   * La source est dépliée : pour une charge, elle porte l'intention de
   * paiement, seul lien avec un encaissement dont les frais ne sont pas
   * encore récupérés.
   */
  private async listTxnsOfPayout(
    stripe: Stripe,
    stripeAccount: string,
    payoutId: string,
  ): Promise<TransitTxn[]> {
    const out: TransitTxn[] = [];
    let startingAfter: string | undefined;
    for (;;) {
      const page = await stripe.balanceTransactions.list(
        {
          payout: payoutId,
          limit: PAGE_SIZE,
          expand: ['data.source'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        { stripeAccount },
      );
      out.push(...page.data.map((t) => toTransitTxn(t)));
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
    return out;
  }

  // ── ClubFlow ───────────────────────────────────────────────────────────

  /** Ce que ClubFlow connaît parmi CES transactions, en trois requêtes. */
  private async knownIndex(clubId: string, txns: readonly TransitTxn[]): Promise<KnownIndex> {
    const txnIds = txns.map((t) => t.id);
    const piIds = txns.map((t) => t.paymentIntentId).filter((v): v is string => !!v);
    const refundIds = txns.map((t) => t.sourceId).filter((v): v is string => !!v);

    const [byTxn, byPi, byRefund] = await Promise.all([
      txnIds.length
        ? this.prisma.payment.findMany({
            where: { clubId, stripeBalanceTransactionId: { in: txnIds } },
            select: { stripeBalanceTransactionId: true },
          })
        : [],
      piIds.length
        ? this.prisma.payment.findMany({
            where: { clubId, externalRef: { in: piIds } },
            select: { externalRef: true },
          })
        : [],
      refundIds.length
        ? this.prisma.payment.findMany({
            where: { clubId, stripeRefundId: { in: refundIds } },
            select: { stripeRefundId: true },
          })
        : [],
    ]);
    return {
      balanceTransactionIds: new Set(
        byTxn.map((p) => p.stripeBalanceTransactionId).filter((v): v is string => !!v),
      ),
      paymentIntentRefs: new Set(
        byPi.map((p) => p.externalRef).filter((v): v is string => !!v),
      ),
      refundIds: new Set(byRefund.map((p) => p.stripeRefundId).filter((v): v is string => !!v)),
    };
  }

  /**
   * Les inconnues d'un mois atterrissent sur un relevé synthétisé du transit,
   * un par mois. Le relevé n'a pas d'arithmétique propre à contrôler — son
   * solde de fin est celui de début plus ses lignes, par construction. Le
   * contrôle qui compte est ailleurs : `payoutArithmetic`, et il vient de
   * Stripe.
   *
   * Idempotent par `fitId` = identifiant de la transaction de solde :
   * repasser sur le même virement n'ajoute aucune ligne.
   */
  private async recordUnknown(
    clubId: string,
    financialAccountId: string,
    unknown: readonly TransitTxn[],
  ): Promise<number> {
    const byMonth = new Map<string, TransitTxn[]>();
    for (const t of unknown) {
      const key = monthKey(new Date(t.created * 1000));
      const list = byMonth.get(key);
      if (list) list.push(t);
      else byMonth.set(key, [t]);
    }

    let added = 0;
    for (const [key, txns] of byMonth) {
      const periodStart = monthStart(key);
      const periodEnd = monthEnd(key);
      const statement = await this.ensureStatement(
        clubId,
        financialAccountId,
        periodStart,
        periodEnd,
      );
      const existing = await this.prisma.bankStatementLine.findMany({
        where: { statementId: statement.id },
        select: { fitId: true, lineIndex: true },
      });
      const seen = new Set(existing.map((l) => l.fitId).filter((v): v is string => !!v));
      let nextIndex = existing.reduce((m, l) => Math.max(m, l.lineIndex), -1) + 1;

      for (const t of txns.slice().sort((a, b) => a.created - b.created)) {
        if (seen.has(t.id)) continue;
        const label = labelForTxn(t);
        await this.prisma.bankStatementLine.create({
          data: {
            clubId,
            statementId: statement.id,
            financialAccountId,
            lineIndex: nextIndex++,
            bookedOn: dayOf(new Date(t.created * 1000)),
            label,
            rawLabel: label,
            reference: t.sourceId,
            // Le net est ce qui a réellement bougé le solde Stripe. Le brut
            // et sa commission ne se distinguent pas ici : c'est au
            // trésorier de trancher en catégorisant.
            amountCents: t.netCents,
            fitId: t.id,
            status: BankStatementLineStatus.UNMATCHED,
          },
        });
        seen.add(t.id);
        added += 1;
      }

      await this.rebalance(clubId, statement.id);
    }
    return added;
  }

  private async ensureStatement(
    clubId: string,
    financialAccountId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const existing = await this.prisma.bankStatement.findFirst({
      where: {
        clubId,
        financialAccountId,
        format: BankStatementFormat.STRIPE_API,
        periodStart,
      },
      select: { id: true, openingBalanceCents: true },
    });
    if (existing) return existing;

    const previous = await this.integrity.previousStatement(
      clubId,
      financialAccountId,
      periodStart,
      null,
    );
    const account = await this.prisma.clubFinancialAccount.findUniqueOrThrow({
      where: { id: financialAccountId },
      select: { openingBalanceCents: true },
    });
    const openingBalanceCents =
      previous?.closingBalanceCents ?? account.openingBalanceCents ?? 0;
    return this.prisma.bankStatement.create({
      data: {
        clubId,
        financialAccountId,
        format: BankStatementFormat.STRIPE_API,
        periodStart,
        periodEnd,
        openingBalanceCents,
        closingBalanceCents: openingBalanceCents,
      },
      select: { id: true, openingBalanceCents: true },
    });
  }

  /** Solde de fin = solde de début + lignes, puis contrôle et chaînage. */
  private async rebalance(clubId: string, statementId: string): Promise<void> {
    const st = await this.prisma.bankStatement.findUniqueOrThrow({
      where: { id: statementId },
      select: {
        openingBalanceCents: true,
        financialAccountId: true,
        periodEnd: true,
        lines: { select: { amountCents: true } },
      },
    });
    const sum = st.lines.reduce((s, l) => s + l.amountCents, 0);
    await this.prisma.bankStatement.update({
      where: { id: statementId },
      data: {
        closingBalanceCents: st.openingBalanceCents + sum,
        lineCount: st.lines.length,
      },
    });
    await this.integrity.recompute(clubId, statementId);
    await this.integrity.rechainFollowing(
      clubId,
      st.financialAccountId,
      st.periodEnd,
      statementId,
    );
  }

  private lookbackFrom(syncedAt: Date | null, accountingStartsOn: Date): Date {
    const floor = new Date(Date.now() - MAX_LOOKBACK_DAYS * 86_400_000);
    const wanted = syncedAt
      ? new Date(syncedAt.getTime() - OVERLAP_DAYS * 86_400_000)
      : accountingStartsOn;
    const notBeforeReprise = Math.max(wanted.getTime(), accountingStartsOn.getTime());
    return new Date(Math.max(notBeforeReprise, floor.getTime()));
  }
}

/** Ce qu'on retient d'une transaction Stripe, source dépliée comprise. */
function toTransitTxn(t: Stripe.BalanceTransaction): TransitTxn {
  const source = t.source as string | Record<string, unknown> | null;
  const sourceId =
    typeof source === 'string' ? source : ((source?.id as string | undefined) ?? null);
  let paymentIntentId: string | null = null;
  if (source && typeof source !== 'string') {
    const pi = (source as { payment_intent?: string | { id?: string } }).payment_intent;
    paymentIntentId = typeof pi === 'string' ? pi : (pi?.id ?? null);
  }
  return {
    id: t.id,
    type: t.type,
    netCents: t.net,
    description: t.description ?? null,
    created: t.created,
    sourceId,
    paymentIntentId,
  };
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function monthStart(key: string): Date {
  return new Date(`${key}-01T00:00:00.000Z`);
}

function monthEnd(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0));
}

function dayOf(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}
