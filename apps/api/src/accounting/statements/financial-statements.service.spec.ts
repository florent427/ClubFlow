import { AccountingFiscalYearService } from '../accounting-fiscal-year.service';
import { FinancialStatementsService } from './financial-statements.service';

/**
 * Le service rassemble ce que le calcul consomme. Ce qui est vérifié : seules
 * les écritures validées (POSTED, LOCKED) et non annulées du club comptent,
 * celles en attente et les brouillons sont dénombrés à part, l'exercice suit
 * le réglage du club, et un compte financier actif sans ouverture est signalé.
 */

const CLUB = 'club-1';
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Entry = {
  id: string;
  clubId: string;
  status: string;
  cancelledAt: Date | null;
  occurredAt: Date;
  amountCents: number;
};
type Line = {
  entryId: string;
  clubId: string;
  accountCode: string;
  accountLabel: string;
  debitCents: number;
  creditCents: number;
};

interface EntryWhere {
  clubId?: string;
  status?: { in: string[] };
  cancelledAt?: null;
  occurredAt?: { lt?: Date };
}

/**
 * Écrit EN FACE des clauses que le service pose : chacune filtre ici, donc
 * un service qui en oublierait une laisserait passer une écriture interdite
 * et un test tomberait.
 */
function entryMatches(e: Entry, w: EntryWhere): boolean {
  if (w.clubId !== undefined && e.clubId !== w.clubId) return false;
  if (w.status && !w.status.in.includes(e.status)) return false;
  if (w.cancelledAt === null && e.cancelledAt !== null) return false;
  if (w.occurredAt?.lt && !(e.occurredAt < w.occurredAt.lt)) return false;
  return true;
}

function makeService(data: {
  entries: Entry[];
  lines: Line[];
  financialAccounts?: Array<{
    clubId: string;
    label: string;
    isActive: boolean;
    openingBalanceCents: number | null;
    openingBalanceOn: Date | null;
    code: string;
  }>;
  fiscalYearStartMonth?: number;
}) {
  const byId = new Map(data.entries.map((e) => [e.id, e]));
  const prisma = {
    club: {
      findUnique: jest.fn(async () => ({
        fiscalYearStartMonth: data.fiscalYearStartMonth ?? 9,
        fiscalYearStartDay: 1,
        accountingStartsOn: null,
      })),
    },
    accountingEntryLine: {
      findMany: jest.fn(async ({ where }: { where: { clubId: string; entry: EntryWhere } }) =>
        data.lines
          .filter((l) => l.clubId === where.clubId)
          .filter((l) => {
            const e = byId.get(l.entryId);
            return e !== undefined && entryMatches(e, where.entry);
          })
          .map((l) => ({ ...l, entry: { occurredAt: byId.get(l.entryId)!.occurredAt } })),
      ),
    },
    accountingAccount: {
      findMany: jest.fn(async () => []),
    },
    clubFinancialAccount: {
      findMany: jest.fn(async ({ where }: { where: { clubId: string } }) =>
        (data.financialAccounts ?? [])
          .filter((a) => a.clubId === where.clubId)
          .map((a) => ({ ...a, accountingAccount: { code: a.code } })),
      ),
    },
    accountingEntry: {
      groupBy: jest.fn(async ({ where }: { where: EntryWhere }) => {
        const groups = new Map<string, { count: number; sum: number }>();
        for (const e of data.entries.filter((x) => entryMatches(x, where))) {
          const g = groups.get(e.status) ?? { count: 0, sum: 0 };
          g.count += 1;
          g.sum += e.amountCents;
          groups.set(e.status, g);
        }
        return [...groups].map(([status, g]) => ({
          status,
          _count: { _all: g.count },
          _sum: { amountCents: g.sum },
        }));
      }),
    },
  };
  const svc = new FinancialStatementsService(
    prisma as never,
    new AccountingFiscalYearService(prisma as never),
  );
  return { svc, prisma };
}

function pair(id: string, clubId: string, debit: string, credit: string, cents: number): Line[] {
  return [
    { entryId: id, clubId, accountCode: debit, accountLabel: debit, debitCents: cents, creditCents: 0 },
    { entryId: id, clubId, accountCode: credit, accountLabel: credit, debitCents: 0, creditCents: cents },
  ];
}

function e(
  id: string,
  status: string,
  on: string,
  over: Partial<Entry> = {},
): Entry {
  return {
    id,
    clubId: CLUB,
    status,
    cancelledAt: null,
    occurredAt: day(on),
    amountCents: 1_000,
    ...over,
  };
}

describe('FinancialStatementsService', () => {
  it('ne compte que les écritures validées, non annulées, du club, jusqu’à la date', async () => {
    const entries = [
      e('posted', 'POSTED', '2026-09-05'),
      e('locked', 'LOCKED', '2026-09-06'),
      e('review', 'NEEDS_REVIEW', '2026-09-07', { amountCents: 4_200 }),
      e('draft', 'DRAFT', '2026-09-08'),
      e('cancelled', 'CANCELLED', '2026-09-09', { cancelledAt: day('2026-09-10') }),
      e('stale', 'POSTED', '2026-09-09', { cancelledAt: day('2026-09-10') }),
      e('later', 'POSTED', '2026-10-11'),
      e('other', 'POSTED', '2026-09-05', { clubId: 'club-2' }),
    ];
    const lines = [
      ...pair('posted', CLUB, '512000', '756000', 1_000),
      ...pair('locked', CLUB, '512000', '756000', 2_000),
      ...pair('review', CLUB, '512000', '756000', 4_200),
      ...pair('draft', CLUB, '512000', '756000', 8_000),
      ...pair('cancelled', CLUB, '512000', '756000', 16_000),
      ...pair('stale', CLUB, '512000', '756000', 128_000),
      ...pair('later', CLUB, '512000', '756000', 32_000),
      ...pair('other', 'club-2', '512000', '756000', 64_000),
    ];
    const { svc } = makeService({ entries, lines });

    const r = await svc.statements(CLUB, day('2026-10-10'));

    expect(r.incomeStatement.totalRevenuesCents).toBe(3_000);
    expect(r.balanceSheet.totalAssetsCents).toBe(3_000);
    expect(r.needsReviewCount).toBe(1);
    expect(r.needsReviewCents).toBe(4_200);
    expect(r.draftCount).toBe(1);
  });

  it('borne le résultat à l’exercice du club', async () => {
    const entries = [e('a', 'POSTED', '2026-08-31'), e('b', 'POSTED', '2026-09-01')];
    const lines = [
      ...pair('a', CLUB, '512000', '756000', 1_000),
      ...pair('b', CLUB, '512000', '756000', 2_000),
    ];
    const { svc } = makeService({ entries, lines });

    const r = await svc.statements(CLUB, day('2026-10-10'));

    expect(r.fiscalYear.label).toBe('2026-2027');
    expect(r.incomeStatement.totalRevenuesCents).toBe(2_000);
    expect(r.balanceSheet.liabilities.find((s) => s.key === 'report')?.totalCents).toBe(1_000);
  });

  it('applique les soldes d’ouverture et signale les comptes actifs qui n’en ont pas', async () => {
    const { svc } = makeService({
      entries: [],
      lines: [],
      financialAccounts: [
        { clubId: CLUB, label: 'Banque', isActive: true, openingBalanceCents: 5_000, openingBalanceOn: day('2026-09-01'), code: '512000' },
        { clubId: CLUB, label: 'Caisse', isActive: true, openingBalanceCents: null, openingBalanceOn: null, code: '530000' },
        { clubId: CLUB, label: 'Ancien livret', isActive: false, openingBalanceCents: null, openingBalanceOn: null, code: '512100' },
        { clubId: 'club-2', label: 'Autre', isActive: true, openingBalanceCents: 9_999, openingBalanceOn: day('2026-09-01'), code: '512000' },
      ],
    });

    const r = await svc.statements(CLUB, day('2026-10-10'));

    expect(r.balanceSheet.totalAssetsCents).toBe(5_000);
    expect(r.balanceSheet.imbalanceCents).toBe(5_000);
    expect(r.financialAccountsWithoutOpening).toEqual(['Caisse']);
  });
});
