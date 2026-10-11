import type { AccountingAllocationService } from './accounting-allocation.service';
import type { AccountingAuditService } from './accounting-audit.service';
import type { AccountingMappingService } from './accounting-mapping.service';
import type { AccountingPeriodService } from './accounting-period.service';
import type { AccountingSeedService } from './accounting-seed.service';
import type { AccountingSuggestionService } from './accounting-suggestion.service';
import { AccountingService } from './accounting.service';
import type { ClubFinancialAccountsService } from './club-financial-accounts.service';
import {
  computeInKindCounterparts,
  inKindResourceAccountFor,
} from './in-kind-counterparts';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Contribution en nature (bénévolat, mise à disposition, dons) : l'écriture
 * équilibre un emploi 86x par une ressource 87x, sans jamais toucher la
 * trésorerie. La saisie manuelle posait la banque 512 en contrepartie : le
 * bénévolat gonflait le solde bancaire du bilan, et une saisie 864 + 870
 * en deux articles donnait une écriture déséquilibrée.
 */
describe('computeInKindCounterparts', () => {
  it('apparie chaque emploi à sa ressource', () => {
    expect(inKindResourceAccountFor('864000')).toBe('870000');
    expect(inKindResourceAccountFor('860000')).toBe('875000');
    expect(inKindResourceAccountFor('861000')).toBe('871000');
    expect(inKindResourceAccountFor('862000')).toBe('871000');
  });

  it('une ligne de crédit par ressource, somme des emplois qui y mènent', () => {
    expect(
      computeInKindCounterparts([
        { accountCode: '864000', debitCents: 30_000 },
        { accountCode: '861000', debitCents: 5_000 },
        { accountCode: '864000', debitCents: 12_000 },
      ]),
    ).toEqual([
      { accountCode: '870000', creditCents: 42_000 },
      { accountCode: '871000', creditCents: 5_000 },
    ]);
  });

  it('ignore les contreparties déjà présentes et tout ce qui n’est pas un emploi', () => {
    expect(
      computeInKindCounterparts([
        { accountCode: '864000', debitCents: 10_000 },
        { accountCode: '870000', debitCents: 0 },
        { accountCode: '512000', debitCents: 10_000 },
      ]),
    ).toEqual([{ accountCode: '870000', creditCents: 10_000 }]);
  });
});

type Line = {
  id: string;
  entryId: string;
  accountCode: string;
  debitCents: number;
  creditCents: number;
  sortOrder: number;
};

/** Double en mémoire des lignes : findMany / deleteMany suivent la requête. */
function makeSvc() {
  const lines: Line[] = [];
  let seq = 0;
  const lineDelegate = {
    create: jest.fn(async ({ data }: { data: Omit<Line, 'id'> }) => {
      const l = { id: `line-${++seq}`, ...data } as Line;
      lines.push(l);
      return l;
    }),
    findMany: jest.fn(async ({ where }: { where: { entryId: string } }) =>
      lines.filter((l) => l.entryId === where.entryId),
    ),
    deleteMany: jest.fn(
      async ({
        where,
      }: {
        where: { entryId: string; accountCode: { startsWith: string } };
      }) => {
        const keep = lines.filter(
          (l) =>
            !(
              l.entryId === where.entryId &&
              l.accountCode.startsWith(where.accountCode.startsWith)
            ),
        );
        const count = lines.length - keep.length;
        lines.splice(0, lines.length, ...keep);
        return { count };
      },
    ),
    update: jest.fn(
      async ({ where, data }: { where: { id: string }; data: Partial<Line> }) => {
        const l = lines.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return { ...l, entry: { id: l.entryId } };
      },
    ),
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
      const l = lines.find((x) => x.id === where.id);
      if (!l) return null;
      return {
        ...l,
        validatedAt: null,
        entry: {
          id: l.entryId,
          kind: 'IN_KIND',
          status: 'NEEDS_REVIEW',
          occurredAt: new Date('2026-10-01T00:00:00.000Z'),
        },
      };
    }),
    count: jest.fn(async () => 1),
  };
  const tx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'entry-1',
        ...data,
      })),
    },
    accountingEntryLine: lineDelegate,
    accountingDocument: { create: jest.fn() },
  };
  const kindOf = (code: string) =>
    code.startsWith('8') ? 'NEUTRAL_IN_KIND' : code.startsWith('5') ? 'ASSET' : 'EXPENSE';
  const prisma = {
    ...tx,
    accountingAccount: {
      findUnique: jest.fn(
        async ({ where }: { where: { clubId_code: { code: string } } }) => ({
          code: where.clubId_code.code,
          label: `Compte ${where.clubId_code.code}`,
          kind: kindOf(where.clubId_code.code),
        }),
      ),
    },
    clubFinancialAccount: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const financialAccounts = { getDefault: jest.fn() };
  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    {
      persistAllocationsForLine: jest.fn(async () => undefined),
    } as unknown as AccountingAllocationService,
    {} as AccountingMappingService,
    { assertDateIsOpen: jest.fn(async () => undefined) } as unknown as AccountingPeriodService,
    { log: jest.fn(async () => undefined) } as unknown as AccountingAuditService,
    {} as AccountingSuggestionService,
    { seedIfEmpty: jest.fn(async () => undefined) } as unknown as AccountingSeedService,
    financialAccounts as unknown as ClubFinancialAccountsService,
    {
      onEntryPosted: jest.fn(async () => null),
      refreshStatementStatus: jest.fn(async () => undefined),
    } as never,
  );
  return { svc, lines, tx, prisma, financialAccounts };
}

const balance = (ls: Line[]) =>
  ls.reduce((s, l) => s + l.debitCents - l.creditCents, 0);

describe('AccountingService — écriture en nature', () => {
  it('saisie simple : 864 au débit, 870 au crédit, aucune banque', async () => {
    const { svc, lines, tx, financialAccounts } = makeSvc();

    await svc.createManualEntry('club-1', 'user-1', {
      kind: 'IN_KIND',
      label: 'Bénévolat encadrement septembre',
      accountCode: '864000',
      amountCents: 48_000,
    } as never);

    expect(financialAccounts.getDefault).not.toHaveBeenCalled();
    expect(tx.accountingEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ financialAccountId: null }),
    });
    expect(lines.map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([
      ['864000', 48_000, 0],
      ['870000', 0, 48_000],
    ]);
    expect(balance(lines)).toBe(0);
  });

  it('refuse un article 87x : la ressource ne se saisit pas', async () => {
    const { svc, lines } = makeSvc();

    await expect(
      svc.createManualEntry('club-1', 'user-1', {
        kind: 'IN_KIND',
        label: 'Bénévolat',
        accountCode: '870000',
        amountCents: 10_000,
      } as never),
    ).rejects.toThrow(/86x/);
    expect(lines).toHaveLength(0);
  });

  it('saisie multi-articles : une contrepartie par ressource, sans banque', async () => {
    const { svc, lines } = makeSvc();

    await svc.createQuickEntry('club-1', 'user-1', {
      kind: 'IN_KIND',
      label: 'Contributions octobre',
      amountCents: 35_000,
      articles: [
        { label: 'Encadrement', amountCents: 30_000, accountCode: '864000' },
        { label: 'Prêt du gymnase', amountCents: 5_000, accountCode: '861000' },
      ],
    } as never);

    expect(lines.map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([
      ['864000', 30_000, 0],
      ['861000', 5_000, 0],
      ['870000', 0, 30_000],
      ['871000', 0, 5_000],
    ]);
    expect(lines.some((l) => l.accountCode.startsWith('5'))).toBe(false);
    expect(balance(lines)).toBe(0);
  });

  it('changer le compte d’un article déplace la contrepartie (861 → 864 : 871 → 870)', async () => {
    const { svc, lines } = makeSvc();
    await svc.createQuickEntry('club-1', 'user-1', {
      kind: 'IN_KIND',
      label: 'Contribution',
      amountCents: 20_000,
      articles: [
        { label: 'Aide au tournoi', amountCents: 20_000, accountCode: '861000' },
      ],
    } as never);
    const article = lines.find((l) => l.accountCode === '861000')!;

    await svc.validateEntryLine('club-1', 'user-1', article.id, '864000');

    expect(
      lines
        .map((l) => [l.accountCode, l.debitCents, l.creditCents])
        .sort(),
    ).toEqual([
      ['864000', 20_000, 0],
      ['870000', 0, 20_000],
    ]);
    expect(balance(lines)).toBe(0);
  });

  it('refuse de recatégoriser la contrepartie calculée', async () => {
    const { svc, lines } = makeSvc();
    await svc.createManualEntry('club-1', 'user-1', {
      kind: 'IN_KIND',
      label: 'Bénévolat',
      accountCode: '864000',
      amountCents: 10_000,
    } as never);
    const counterpart = lines.find((l) => l.accountCode === '870000')!;

    await expect(
      svc.validateEntryLine('club-1', 'user-1', counterpart.id, '864000'),
    ).rejects.toThrow(/Contrepartie calculée/);
  });
});
