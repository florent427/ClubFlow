import { Injectable } from '@nestjs/common';
import { AccountingEntryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountingFiscalYearService,
  type FiscalYearBounds,
} from '../accounting-fiscal-year.service';
import { buildFinancialStatements, type FinancialStatements } from './financial-statements';

/** Seules les écritures validées comptent ; les annulées restent en base. */
const COUNTED_STATUSES = [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED];

const ONE_DAY_MS = 86_400_000;

export interface FinancialStatementsReport extends FinancialStatements {
  asOf: Date;
  fiscalYear: FiscalYearBounds;
  /** Écritures en attente de validation à la date : exclues des états. */
  needsReviewCount: number;
  needsReviewCents: number;
  /** Brouillons à la date : exclus aussi. */
  draftCount: number;
  /** Comptes financiers actifs sans solde d'ouverture. */
  financialAccountsWithoutOpening: string[];
}

/**
 * Bilan et compte de résultat provisoires à une date (« à l'instant T »).
 * Le calcul vit dans `financial-statements.ts` ; ce service ne fait que
 * rassembler les lignes comptées, les soldes d'ouverture et le plan.
 */
@Injectable()
export class FinancialStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fiscal: AccountingFiscalYearService,
  ) {}

  async statements(clubId: string, asOf: Date): Promise<FinancialStatementsReport> {
    const settings = await this.fiscal.getSettings(clubId);
    const fiscalYear = AccountingFiscalYearService.boundsFor(
      settings,
      AccountingFiscalYearService.yearFor(settings, asOf),
    );
    const before = new Date(asOf.getTime() + ONE_DAY_MS);

    const [rows, accounts, financialAccounts, pending] = await Promise.all([
      this.prisma.accountingEntryLine.findMany({
        where: {
          clubId,
          entry: {
            clubId,
            status: { in: COUNTED_STATUSES },
            cancelledAt: null,
            occurredAt: { lt: before },
          },
        },
        select: {
          accountCode: true,
          accountLabel: true,
          debitCents: true,
          creditCents: true,
          entry: { select: { occurredAt: true } },
        },
      }),
      this.prisma.accountingAccount.findMany({
        where: { clubId },
        select: { code: true, label: true },
      }),
      this.prisma.clubFinancialAccount.findMany({
        where: { clubId },
        select: {
          label: true,
          isActive: true,
          openingBalanceCents: true,
          openingBalanceOn: true,
          accountingAccount: { select: { code: true } },
        },
      }),
      this.prisma.accountingEntry.groupBy({
        by: ['status'],
        where: {
          clubId,
          status: { in: [AccountingEntryStatus.NEEDS_REVIEW, AccountingEntryStatus.DRAFT] },
          cancelledAt: null,
          occurredAt: { lt: before },
        },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ]);

    const built = buildFinancialStatements({
      fiscalYearStartsOn: fiscalYear.startsOn,
      asOf,
      lines: rows.map((r) => ({
        accountCode: r.accountCode,
        accountLabel: r.accountLabel,
        debitCents: r.debitCents,
        creditCents: r.creditCents,
        occurredAt: r.entry.occurredAt,
      })),
      openings: financialAccounts
        .filter((a) => a.openingBalanceCents !== null && a.openingBalanceOn !== null)
        .map((a) => ({
          accountCode: a.accountingAccount.code,
          cents: a.openingBalanceCents!,
          on: a.openingBalanceOn!,
        })),
      accountLabels: new Map(accounts.map((a) => [a.code, a.label])),
    });

    const review = pending.find((p) => p.status === AccountingEntryStatus.NEEDS_REVIEW);
    const draft = pending.find((p) => p.status === AccountingEntryStatus.DRAFT);

    return {
      ...built,
      asOf,
      fiscalYear,
      needsReviewCount: review?._count._all ?? 0,
      needsReviewCents: review?._sum.amountCents ?? 0,
      draftCount: draft?._count._all ?? 0,
      financialAccountsWithoutOpening: financialAccounts
        .filter((a) => a.isActive && a.openingBalanceCents === null)
        .map((a) => a.label),
    };
  }
}
