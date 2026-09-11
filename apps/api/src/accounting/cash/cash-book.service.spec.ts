import { BadRequestException } from '@nestjs/common';
import { CashBookService } from './cash-book.service';

/**
 * Livre de caisse (ADR-0014 §8). Ce qui est vérifié : le solde d'une caisse
 * se lit sur son COMPTE PCG et non sur le compte porteur de l'écriture (un
 * dépôt en banque vide la caisse tout en étant porté par la banque), le
 * solde d'ouverture n'est jamais recompté, compter ne comptabilise rien, et
 * l'écart validé tombe du bon côté.
 */

const CLUB = 'club-1';
const CASH = '530000';
const BANK = '512000';
const SHORTAGE = '658000';
const SURPLUS = '758000';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Line = {
  id: string;
  entryId: string;
  clubId: string;
  accountCode: string;
  accountLabel: string;
  label?: string | null;
  side: string;
  debitCents: number;
  creditCents: number;
  sortOrder: number;
  bankReconciledAt: Date | null;
};

type Entry = {
  id: string;
  clubId: string;
  kind: string;
  status: string;
  source: string;
  label: string;
  amountCents: number;
  occurredAt: Date;
  createdAt: Date;
  cancelledAt: Date | null;
  financialAccountId: string | null;
};

type Count = {
  id: string;
  clubId: string;
  financialAccountId: string;
  countedOn: Date;
  countedCents: number;
  expectedCents: number;
  deltaCents: number;
  note: string | null;
  adjustmentEntryId: string | null;
  validatedAt: Date | null;
  validatedByUserId: string | null;
  countedByUserId: string | null;
  createdAt: Date;
};

interface DateFilter {
  gte?: Date;
  lte?: Date;
}

/**
 * Reproduit les clauses que le service écrit — et surtout celles qu'il
 * pourrait écrire à tort. Un double qui ignore `financialAccountId` laisse
 * passer un service qui filtre dessus : le dépôt en banque disparaîtrait du
 * livre de la caisse sans qu'aucun test ne bronche (piège du double trop
 * généreux, déjà rencontré au lot 5).
 */
function entryMatches(
  e: Entry,
  where: {
    status?: { in: string[] };
    cancelledAt?: null;
    occurredAt?: DateFilter;
    financialAccountId?: string;
  },
): boolean {
  if (where.status && !where.status.in.includes(e.status)) return false;
  if (where.cancelledAt === null && e.cancelledAt !== null) return false;
  if (where.financialAccountId !== undefined && e.financialAccountId !== where.financialAccountId) {
    return false;
  }
  const d = where.occurredAt;
  if (d?.gte && e.occurredAt.getTime() < d.gte.getTime()) return false;
  if (d?.lte && e.occurredAt.getTime() > d.lte.getTime()) return false;
  return true;
}

function makeWorld(
  opts: {
    openingBalanceCents?: number | null;
    openingBalanceOn?: Date | null;
    cashKind?: string;
    counts?: Count[];
  } = {},
) {
  const cashAccount = {
    id: 'fa-cash',
    clubId: CLUB,
    kind: opts.cashKind ?? 'CASH',
    label: 'Caisse principale',
    isActive: true,
    openingBalanceCents:
      opts.openingBalanceCents === undefined ? 10_000 : opts.openingBalanceCents,
    openingBalanceOn:
      opts.openingBalanceOn === undefined ? day('2026-01-01') : opts.openingBalanceOn,
    accountingAccount: { id: 'a-cash', code: CASH, label: 'Caisse principale (générique)' },
  };
  const bankAccount = {
    id: 'fa-bank',
    clubId: CLUB,
    kind: 'BANK',
    label: 'Banque principale',
    isActive: true,
    openingBalanceCents: 0,
    openingBalanceOn: day('2026-01-01'),
    accountingAccount: { id: 'a-bank', code: BANK, label: 'Banque (générique)' },
  };
  // Une seconde caisse : un club en a souvent (buvette, événement). Elle
  // sert à vérifier qu'un mouvement d'espèces relie bien une caisse à une
  // banque, et pas deux caisses entre elles.
  const otherCashAccount = {
    id: 'fa-cash-2',
    clubId: CLUB,
    kind: 'CASH',
    label: 'Caisse buvette',
    isActive: true,
    openingBalanceCents: 0,
    openingBalanceOn: day('2026-01-01'),
    accountingAccount: { id: 'a-cash-2', code: '530300', label: 'Caisse buvette' },
  };
  const financialAccountsById = new Map([
    [cashAccount.id, cashAccount],
    [bankAccount.id, bankAccount],
    [otherCashAccount.id, otherCashAccount],
  ]);

  const entries: Entry[] = [];
  const lines: Line[] = [];
  const counts: Count[] = opts.counts ? [...opts.counts] : [];
  let seq = 0;

  function addEntry(e: Partial<Entry>, ls: Array<Partial<Line>>): Entry {
    const entry: Entry = {
      id: e.id ?? `e-${++seq}`,
      clubId: CLUB,
      kind: e.kind ?? 'EXPENSE',
      status: e.status ?? 'POSTED',
      source: e.source ?? 'MANUAL',
      label: e.label ?? 'Écriture',
      amountCents: e.amountCents ?? 0,
      occurredAt: e.occurredAt ?? day('2026-01-15'),
      createdAt: e.createdAt ?? day('2026-01-15'),
      cancelledAt: e.cancelledAt ?? null,
      financialAccountId: e.financialAccountId ?? cashAccount.id,
    };
    entries.push(entry);
    ls.forEach((l, i) =>
      lines.push({
        id: `l-${++seq}`,
        entryId: entry.id,
        clubId: CLUB,
        accountCode: l.accountCode!,
        accountLabel: l.accountLabel ?? l.accountCode!,
        label: l.label ?? null,
        side: l.side ?? 'DEBIT',
        debitCents: l.debitCents ?? 0,
        creditCents: l.creditCents ?? 0,
        sortOrder: l.sortOrder ?? i,
        bankReconciledAt: l.bankReconciledAt ?? null,
      }),
    );
    return entry;
  }

  const chart = [
    { id: 'a-cash', code: CASH, label: 'Caisse principale (générique)' },
    { id: 'a-bank', code: BANK, label: 'Banque (générique)' },
    { id: 'a-short', code: SHORTAGE, label: 'Charges diverses de gestion courante' },
    { id: 'a-surplus', code: SURPLUS, label: 'Produits divers de gestion courante' },
  ];

  const prisma: Record<string, unknown> = {
    accountingEntryLine: {
      // Fidèle : sans `accountCode`, toutes les lignes de l'écriture
      // entreraient dans la somme et le solde serait faux.
      aggregate: jest.fn(
        async ({
          where,
        }: {
          where: { accountCode: string; entry: Parameters<typeof entryMatches>[1] };
        }) => {
          const kept = lines.filter((l) => {
            if (where.accountCode !== undefined && l.accountCode !== where.accountCode) {
              return false;
            }
            const e = entries.find((x) => x.id === l.entryId)!;
            return entryMatches(e, where.entry ?? {});
          });
          return {
            _sum: {
              debitCents: kept.reduce((s, l) => s + l.debitCents, 0),
              creditCents: kept.reduce((s, l) => s + l.creditCents, 0),
            },
          };
        },
      ),
      createMany: jest.fn(async ({ data }: { data: Array<Partial<Line>> }) => {
        data.forEach((l, i) =>
          lines.push({
            id: `l-${++seq}`,
            entryId: l.entryId!,
            clubId: CLUB,
            accountCode: l.accountCode!,
            accountLabel: l.accountLabel ?? '',
            label: l.label ?? null,
            side: l.side ?? 'DEBIT',
            debitCents: l.debitCents ?? 0,
            creditCents: l.creditCents ?? 0,
            sortOrder: l.sortOrder ?? i,
            bankReconciledAt: null,
          }),
        );
        return { count: data.length };
      }),
    },
    accountingEntry: {
      // Fidèle : c'est `lines.some.accountCode` qui retient une écriture,
      // pas le compte financier qui la porte.
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: Parameters<typeof entryMatches>[1] & {
            lines?: { some: { accountCode: string } };
          };
        }) =>
          entries
            .filter((e) => {
              if (!entryMatches(e, where)) return false;
              const code = where.lines?.some.accountCode;
              if (code === undefined) return true;
              return lines.some((l) => l.entryId === e.id && l.accountCode === code);
            })
            .sort(
              (a, b) =>
                a.occurredAt.getTime() - b.occurredAt.getTime() ||
                a.createdAt.getTime() - b.createdAt.getTime(),
            )
            .map((e) => ({
              ...e,
              lines: lines
                .filter((l) => l.entryId === e.id)
                .sort((a, b) => a.sortOrder - b.sortOrder),
            })),
      ),
      create: jest.fn(async ({ data }: { data: Partial<Entry> }) => {
        const e: Entry = {
          id: `e-${++seq}`,
          clubId: CLUB,
          kind: data.kind!,
          status: data.status!,
          source: data.source!,
          label: data.label!,
          amountCents: data.amountCents!,
          occurredAt: data.occurredAt!,
          createdAt: new Date(),
          cancelledAt: null,
          financialAccountId: data.financialAccountId ?? null,
        };
        entries.push(e);
        return e;
      }),
    },
    accountingAccount: {
      findFirst: jest.fn(
        async ({ where }: { where: { code: string } }) =>
          chart.find((a) => a.code === where.code) ?? null,
      ),
    },
    cashCount: {
      findFirst: jest.fn(
        async ({ where }: { where: { id?: string; financialAccountId?: string; countedOn?: Date } }) =>
          counts.find(
            (c) =>
              (where.id === undefined || c.id === where.id) &&
              (where.financialAccountId === undefined ||
                c.financialAccountId === where.financialAccountId) &&
              (where.countedOn === undefined ||
                c.countedOn.getTime() === where.countedOn.getTime()),
          ) ?? null,
      ),
      findMany: jest.fn(async () => counts),
      create: jest.fn(async ({ data }: { data: Partial<Count> }) => {
        const c: Count = {
          id: `cc-${++seq}`,
          clubId: CLUB,
          financialAccountId: data.financialAccountId!,
          countedOn: data.countedOn!,
          countedCents: data.countedCents!,
          expectedCents: data.expectedCents!,
          deltaCents: data.deltaCents!,
          note: data.note ?? null,
          adjustmentEntryId: null,
          validatedAt: null,
          validatedByUserId: null,
          countedByUserId: data.countedByUserId ?? null,
          createdAt: new Date(),
        };
        counts.push(c);
        return c;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Count> }) => {
        const c = counts.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const i = counts.findIndex((x) => x.id === where.id);
        return counts.splice(i, 1)[0];
      }),
    },
  };
  (prisma as { $transaction: unknown }).$transaction = jest.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );
  // Deux appelants, deux `include` : `getCount` veut le libellé de la caisse,
  // `validateCashCount` veut en plus son compte PCG. Le double suit la
  // requête, sinon un service qui oublie l'imbrication resterait vert.
  (prisma.cashCount as { findFirst: jest.Mock }).findFirst = jest.fn(
    async ({
      where,
      include,
    }: {
      where: { id?: string; financialAccountId?: string; countedOn?: Date };
      include?: { financialAccount?: { include?: { accountingAccount?: boolean } } };
    }) => {
      const c = counts.find(
        (x) =>
          (where.id === undefined || x.id === where.id) &&
          (where.financialAccountId === undefined ||
            x.financialAccountId === where.financialAccountId) &&
          (where.countedOn === undefined || x.countedOn.getTime() === where.countedOn.getTime()),
      );
      if (!c) return null;
      if (!include?.financialAccount) return { ...c };
      const account = financialAccountsById.get(c.financialAccountId)!;
      return {
        ...c,
        financialAccount: include.financialAccount.include?.accountingAccount
          ? { ...account }
          : { label: account.label },
      };
    },
  );

  const audit = { log: jest.fn(async () => undefined) };
  const period = { assertDateIsOpen: jest.fn(async () => undefined) };
  const financialAccounts = {
    getById: jest.fn(async (_clubId: string, id: string) => {
      const a = financialAccountsById.get(id);
      if (!a) throw new Error('compte financier introuvable');
      return a;
    }),
  };
  const reconciliation = { matchExistingLineForEntry: jest.fn(async () => null) };

  const svc = new CashBookService(
    prisma as never,
    audit as never,
    period as never,
    financialAccounts as never,
    reconciliation as never,
  );
  return { svc, entries, lines, counts, audit, reconciliation, addEntry, cashAccount, bankAccount };
}

/** Le mois de janvier d'une caisse : une recette, une dépense, un dépôt. */
function januaryWorld(opts: Parameters<typeof makeWorld>[0] = {}) {
  const w = makeWorld(opts);
  // Avant la date de reprise : déjà dans le solde d'ouverture.
  w.addEntry({ occurredAt: day('2025-12-15'), label: 'Vieille recette', amountCents: 5000 }, [
    { accountCode: CASH, side: 'DEBIT', debitCents: 5000 },
    { accountCode: '706100', side: 'CREDIT', creditCents: 5000 },
  ]);
  w.addEntry(
    { occurredAt: day('2026-01-10'), label: 'Buvette du samedi', amountCents: 3000, kind: 'INCOME' },
    [
      { accountCode: CASH, side: 'DEBIT', debitCents: 3000 },
      { accountCode: '706100', side: 'CREDIT', creditCents: 3000 },
    ],
  );
  w.addEntry({ occurredAt: day('2026-01-20'), label: 'Achat glaçons', amountCents: 1200 }, [
    { accountCode: '606400', side: 'DEBIT', debitCents: 1200 },
    { accountCode: CASH, side: 'CREDIT', creditCents: 1200 },
  ]);
  // Le dépôt est porté par la BANQUE : c'est son relevé qui le confirmera.
  w.addEntry(
    {
      occurredAt: day('2026-01-25'),
      label: 'Dépôt d’espèces',
      amountCents: 2000,
      kind: 'TRANSFER',
      source: 'CASH_TRANSFER',
      financialAccountId: 'fa-bank',
    },
    [
      { accountCode: BANK, side: 'DEBIT', debitCents: 2000 },
      { accountCode: CASH, side: 'CREDIT', creditCents: 2000 },
    ],
  );
  return w;
}

describe('CashBookService — le livre', () => {
  it('compte le dépôt en banque comme une sortie de caisse, bien qu’il soit porté par la banque', async () => {
    const { svc } = januaryWorld();
    const book = await svc.book(CLUB, 'fa-cash', day('2026-01-01'), day('2026-01-31'));

    expect(book.lines.map((l) => l.amountCents)).toEqual([3000, -1200, -2000]);
    expect(book.closingCents).toBe(9800);
  });

  it('ne recompte pas ce que le solde d’ouverture contient déjà', async () => {
    const { svc } = januaryWorld();
    const book = await svc.book(CLUB, 'fa-cash', day('2026-01-01'), day('2026-01-31'));

    // 10 000 d'ouverture, sans les 5 000 de décembre.
    expect(book.openingCents).toBe(10_000);
  });

  it('part de zéro, en le disant, quand aucun solde d’ouverture n’a été saisi', async () => {
    const { svc } = januaryWorld({ openingBalanceCents: null, openingBalanceOn: null });
    const book = await svc.book(CLUB, 'fa-cash', day('2026-01-01'), day('2026-01-31'));

    expect(book.hasOpeningBalance).toBe(false);
    // Sans date de reprise, décembre compte aussi : 5000 + 3000 − 1200 − 2000.
    expect(book.closingCents).toBe(4800);
  });

  it('porte un solde courant qui suit chaque ligne', async () => {
    const { svc } = januaryWorld();
    const book = await svc.book(CLUB, 'fa-cash', day('2026-01-01'), day('2026-01-31'));

    expect(book.lines.map((l) => l.balanceCents)).toEqual([13_000, 11_800, 9_800]);
  });

  it('ignore une écriture annulée ou encore en revue', async () => {
    const w = januaryWorld();
    w.addEntry(
      { occurredAt: day('2026-01-12'), label: 'Annulée', amountCents: 9999, cancelledAt: new Date() },
      [{ accountCode: CASH, side: 'DEBIT', debitCents: 9999 }],
    );
    w.addEntry({ occurredAt: day('2026-01-13'), label: 'En revue', amountCents: 8888, status: 'NEEDS_REVIEW' }, [
      { accountCode: CASH, side: 'DEBIT', debitCents: 8888 },
    ]);
    const book = await w.svc.book(CLUB, 'fa-cash', day('2026-01-01'), day('2026-01-31'));

    expect(book.closingCents).toBe(9800);
    expect(book.lines).toHaveLength(3);
  });

  it('refuse une période à l’envers', async () => {
    const { svc } = januaryWorld();
    await expect(
      svc.book(CLUB, 'fa-cash', day('2026-01-31'), day('2026-01-01')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CashBookService — compter', () => {
  it('constate l’écart sans rien comptabiliser', async () => {
    const w = januaryWorld();
    const before = w.entries.length;

    const count = await w.svc.recordCount(CLUB, 'u-1', {
      financialAccountId: 'fa-cash',
      countedOn: day('2026-01-31'),
      countedCents: 9500,
    });

    expect(count.expectedCents).toBe(9800);
    expect(count.deltaCents).toBe(-300);
    expect(w.entries).toHaveLength(before);
    expect(count.validatedAt).toBeNull();
  });

  it('refuse un second comptage le même jour', async () => {
    const w = januaryWorld();
    await w.svc.recordCount(CLUB, 'u-1', {
      financialAccountId: 'fa-cash',
      countedOn: day('2026-01-31'),
      countedCents: 9500,
    });
    await expect(
      w.svc.recordCount(CLUB, 'u-1', {
        financialAccountId: 'fa-cash',
        countedOn: day('2026-01-31'),
        countedCents: 9800,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de compter une caisse dans le futur', async () => {
    const w = januaryWorld();
    const future = new Date(Date.now() + 3 * 86_400_000);
    await expect(
      w.svc.recordCount(CLUB, 'u-1', {
        financialAccountId: 'fa-cash',
        countedOn: future,
        countedCents: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de compter autre chose qu’une caisse', async () => {
    const w = januaryWorld();
    await expect(
      w.svc.recordCount(CLUB, 'u-1', {
        financialAccountId: 'fa-bank',
        countedOn: day('2026-01-31'),
        countedCents: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un tiroir négatif', async () => {
    const w = januaryWorld();
    await expect(
      w.svc.recordCount(CLUB, 'u-1', {
        financialAccountId: 'fa-cash',
        countedOn: day('2026-01-31'),
        countedCents: -1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CashBookService — valider l’écart', () => {
  async function counted(countedCents: number) {
    const w = januaryWorld();
    const c = await w.svc.recordCount(CLUB, 'u-1', {
      financialAccountId: 'fa-cash',
      countedOn: day('2026-01-31'),
      countedCents,
    });
    return { w, countId: c.id };
  }

  it('un manque vide la caisse contre une charge 658000', async () => {
    const { w, countId } = await counted(9500);
    await w.svc.validateCashCount(CLUB, 'u-1', countId);

    const entry = w.entries.find((e) => e.source === 'CASH_ADJUSTMENT')!;
    expect(entry.kind).toBe('EXPENSE');
    expect(entry.amountCents).toBe(300);
    const ls = w.lines.filter((l) => l.entryId === entry.id);
    expect(ls.find((l) => l.side === 'DEBIT')).toMatchObject({ accountCode: SHORTAGE, debitCents: 300 });
    expect(ls.find((l) => l.side === 'CREDIT')).toMatchObject({ accountCode: CASH, creditCents: 300 });
  });

  it('un excédent remplit la caisse contre un produit 758000', async () => {
    const { w, countId } = await counted(10_100);
    await w.svc.validateCashCount(CLUB, 'u-1', countId);

    const entry = w.entries.find((e) => e.source === 'CASH_ADJUSTMENT')!;
    expect(entry.kind).toBe('INCOME');
    expect(entry.amountCents).toBe(300);
    const ls = w.lines.filter((l) => l.entryId === entry.id);
    expect(ls.find((l) => l.side === 'DEBIT')).toMatchObject({ accountCode: CASH, debitCents: 300 });
    expect(ls.find((l) => l.side === 'CREDIT')).toMatchObject({ accountCode: SURPLUS, creditCents: 300 });
  });

  it('l’écriture d’écart est datée du comptage, pas du jour de la validation', async () => {
    const { w, countId } = await counted(9500);
    await w.svc.validateCashCount(CLUB, 'u-1', countId);

    const entry = w.entries.find((e) => e.source === 'CASH_ADJUSTMENT')!;
    expect(entry.occurredAt).toEqual(day('2026-01-31'));
  });

  it('un écart nul se valide sans écrire quoi que ce soit', async () => {
    const { w, countId } = await counted(9800);
    const before = w.entries.length;
    const after = await w.svc.validateCashCount(CLUB, 'u-1', countId);

    expect(w.entries).toHaveLength(before);
    expect(after.validatedAt).not.toBeNull();
    expect(after.adjustmentEntryId).toBeNull();
  });

  it('ne valide pas deux fois', async () => {
    const { w, countId } = await counted(9500);
    await w.svc.validateCashCount(CLUB, 'u-1', countId);
    await expect(w.svc.validateCashCount(CLUB, 'u-1', countId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('laisse jeter un comptage non validé, jamais un comptage validé', async () => {
    const { w, countId } = await counted(9500);
    await expect(w.svc.deleteCount(CLUB, 'u-1', countId)).resolves.toBe(true);

    const { w: w2, countId: id2 } = await counted(9500);
    await w2.svc.validateCashCount(CLUB, 'u-1', id2);
    await expect(w2.svc.deleteCount(CLUB, 'u-1', id2)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CashBookService — dépôts et retraits', () => {
  it('un dépôt fait entrer la banque et sortir la caisse, et l’écriture est portée par la banque', async () => {
    const w = januaryWorld();
    const entry = await w.svc.recordCashTransfer(CLUB, 'u-1', {
      fromAccountId: 'fa-cash',
      toAccountId: 'fa-bank',
      amountCents: 5000,
      on: day('2026-02-02'),
    });

    expect(entry.source).toBe('CASH_TRANSFER');
    // C'est le relevé de la banque qui confirmera ce mouvement.
    expect(entry.financialAccountId).toBe('fa-bank');
    const ls = w.lines.filter((l) => l.entryId === entry.id);
    expect(ls.find((l) => l.side === 'DEBIT')).toMatchObject({ accountCode: BANK, debitCents: 5000 });
    expect(ls.find((l) => l.side === 'CREDIT')).toMatchObject({ accountCode: CASH, creditCents: 5000 });
  });

  it('un retrait va dans l’autre sens, toujours porté par la banque', async () => {
    const w = januaryWorld();
    const entry = await w.svc.recordCashTransfer(CLUB, 'u-1', {
      fromAccountId: 'fa-bank',
      toAccountId: 'fa-cash',
      amountCents: 4000,
      on: day('2026-02-03'),
    });

    expect(entry.financialAccountId).toBe('fa-bank');
    const ls = w.lines.filter((l) => l.entryId === entry.id);
    expect(ls.find((l) => l.side === 'DEBIT')).toMatchObject({ accountCode: CASH, debitCents: 4000 });
    expect(ls.find((l) => l.side === 'CREDIT')).toMatchObject({ accountCode: BANK, creditCents: 4000 });
  });

  it('cherche la ligne de relevé déjà déposée qui porte ce mouvement', async () => {
    const w = januaryWorld();
    const entry = await w.svc.recordCashTransfer(CLUB, 'u-1', {
      fromAccountId: 'fa-cash',
      toAccountId: 'fa-bank',
      amountCents: 5000,
      on: day('2026-02-02'),
    });

    expect(w.reconciliation.matchExistingLineForEntry).toHaveBeenCalledWith(CLUB, entry.id);
  });

  it('refuse un mouvement d’une caisse vers une autre caisse', async () => {
    const w = januaryWorld();
    await expect(
      w.svc.recordCashTransfer(CLUB, 'u-1', {
        fromAccountId: 'fa-cash',
        toAccountId: 'fa-cash-2',
        amountCents: 1000,
        on: day('2026-02-02'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un mouvement d’un compte vers lui-même', async () => {
    const w = januaryWorld();
    await expect(
      w.svc.recordCashTransfer(CLUB, 'u-1', {
        fromAccountId: 'fa-cash',
        toAccountId: 'fa-cash',
        amountCents: 1000,
        on: day('2026-02-02'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un montant nul ou négatif', async () => {
    const w = januaryWorld();
    await expect(
      w.svc.recordCashTransfer(CLUB, 'u-1', {
        fromAccountId: 'fa-cash',
        toAccountId: 'fa-bank',
        amountCents: 0,
        on: day('2026-02-02'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('le dépôt apparaît ensuite au livre de la caisse, en sortie', async () => {
    const w = januaryWorld();
    await w.svc.recordCashTransfer(CLUB, 'u-1', {
      fromAccountId: 'fa-cash',
      toAccountId: 'fa-bank',
      amountCents: 5000,
      on: day('2026-02-02'),
    });
    const book = await w.svc.book(CLUB, 'fa-cash', day('2026-02-01'), day('2026-02-28'));

    expect(book.openingCents).toBe(9800);
    expect(book.lines.map((l) => l.amountCents)).toEqual([-5000]);
    expect(book.closingCents).toBe(4800);
  });
});
