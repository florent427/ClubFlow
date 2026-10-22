import { AccountingService, parseSearchAmountCents } from './accounting.service';

/**
 * Liste des écritures de la page Comptabilité. Constaté en prod le
 * 2026-10-22 (SKSR, 269 écritures) : la liste plafonnait à 200 sans le dire,
 * et le loyer du dojo (1 300 €, 211e écriture) n'apparaissait nulle part,
 * pas même en cherchant.
 *
 * Le double Prisma ne filtre rien de lui-même : il INTERPRÈTE le `where`
 * reçu, clause par clause, comme PostgreSQL le ferait, et lève sur toute
 * clause qu'il ne connaît pas. Un critère oublié par le service laisse donc
 * passer des écritures, et le test le voit
 * (cf. pitfall double-ignore-une-clause-du-where).
 */

type Alloc = { projectId: string | null; cohortCode: string | null };
type Line = {
  accountCode: string;
  accountLabel: string;
  label: string | null;
  allocations: Alloc[];
};
type Entry = {
  id: string;
  clubId: string;
  kind: string;
  status: string;
  source: string;
  label: string;
  amountCents: number;
  invoiceNumber: string | null;
  paymentReference: string | null;
  projectId: string | null;
  financialAccountId: string | null;
  occurredAt: Date;
  lines: Line[];
};

type Where = Record<string, unknown>;

function matchString(value: string | null, cond: unknown): boolean {
  if (typeof cond === 'string') return value === cond;
  const c = cond as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (!['contains', 'startsWith', 'mode'].includes(k))
      throw new Error(`clause chaîne inconnue du double : ${k}`);
  }
  if (value === null) return false;
  const ci = c.mode === 'insensitive';
  const v = ci ? value.toLowerCase() : value;
  if (typeof c.contains === 'string') {
    const n = ci ? c.contains.toLowerCase() : c.contains;
    if (!v.includes(n)) return false;
  }
  if (typeof c.startsWith === 'string') {
    const n = ci ? c.startsWith.toLowerCase() : c.startsWith;
    if (!v.startsWith(n)) return false;
  }
  return true;
}

function matchAlloc(a: Alloc, w: Where): boolean {
  return Object.entries(w).every(([k, cond]) => {
    if (k === 'projectId' || k === 'cohortCode') return a[k] === cond;
    throw new Error(`clause de ventilation inconnue du double : ${k}`);
  });
}

function matchList<T>(
  items: T[],
  cond: unknown,
  match: (item: T, w: Where) => boolean,
): boolean {
  const c = cond as { some?: Where; every?: Where };
  for (const k of Object.keys(c)) {
    if (k !== 'some' && k !== 'every')
      throw new Error(`clause de relation inconnue du double : ${k}`);
  }
  if (c.some && !items.some((i) => match(i, c.some!))) return false;
  if (c.every && !items.every((i) => match(i, c.every!))) return false;
  return true;
}

function matchLine(l: Line, w: Where): boolean {
  return Object.entries(w).every(([k, cond]) => {
    switch (k) {
      case 'accountCode':
      case 'accountLabel':
      case 'label':
        return matchString(l[k], cond);
      case 'allocations':
        return matchList(l.allocations, cond, matchAlloc);
      case 'OR':
        return (cond as Where[]).some((sub) => matchLine(l, sub));
      default:
        throw new Error(`clause de ligne inconnue du double : ${k}`);
    }
  });
}

function matchEntry(e: Entry, w: Where): boolean {
  return Object.entries(w).every(([k, cond]) => {
    switch (k) {
      case 'clubId':
      case 'kind':
      case 'status':
      case 'source':
      case 'projectId':
      case 'financialAccountId':
      case 'amountCents':
        return e[k] === cond;
      case 'id':
        return (cond as { in: string[] }).in.includes(e.id);
      case 'label':
      case 'invoiceNumber':
      case 'paymentReference':
        return matchString(e[k], cond);
      case 'occurredAt': {
        const c = cond as { gte?: Date; lt?: Date };
        if (c.gte && e.occurredAt < c.gte) return false;
        if (c.lt && e.occurredAt >= c.lt) return false;
        return true;
      }
      case 'lines':
        return matchList(e.lines, cond, matchLine);
      case 'AND':
        return (cond as Where[]).every((sub) => matchEntry(e, sub));
      case 'OR':
        return (cond as Where[]).some((sub) => matchEntry(e, sub));
      default:
        throw new Error(`clause d'écriture inconnue du double : ${k}`);
    }
  });
}

function prismaDouble(entries: Entry[]) {
  const sorted = (where: Where) =>
    entries
      .filter((e) => matchEntry(e, where))
      .sort(
        (a, b) =>
          b.occurredAt.getTime() - a.occurredAt.getTime() ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
  return {
    accountingEntry: {
      findMany: jest.fn(
        async (args: { where: Where; take?: number; orderBy: unknown }) => {
          expect(args.orderBy).toEqual([
            { occurredAt: 'desc' },
            { id: 'desc' },
          ]);
          const rows = sorted(args.where);
          return args.take === undefined ? rows : rows.slice(0, args.take);
        },
      ),
      count: jest.fn(
        async (args: { where: Where }) => sorted(args.where).length,
      ),
    },
  };
}

function service(entries: Entry[]) {
  const prisma = prismaDouble(entries);
  const svc = new AccountingService(
    prisma as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
  return { svc, prisma };
}

let seq = 0;
function entry(patch: Partial<Entry> = {}): Entry {
  seq += 1;
  return {
    id: `e-${String(seq).padStart(4, '0')}`,
    clubId: 'club-1',
    kind: 'INCOME',
    status: 'POSTED',
    source: 'AUTO_MEMBER_PAYMENT',
    label: `Cotisation ${seq}`,
    amountCents: 15000,
    invoiceNumber: null,
    paymentReference: null,
    projectId: null,
    financialAccountId: null,
    occurredAt: new Date(Date.UTC(2026, 9, 20) - seq * 3_600_000),
    lines: [
      {
        accountCode: '512000',
        accountLabel: 'Banque',
        label: null,
        allocations: [],
      },
      {
        accountCode: '756000',
        accountLabel: 'Cotisations',
        label: null,
        allocations: [],
      },
    ],
    ...patch,
  };
}

function rent(): Entry {
  return entry({
    kind: 'EXPENSE',
    source: 'MANUAL',
    label: 'Loyer dojo septembre',
    amountCents: 130000,
    occurredAt: new Date('2026-09-04T00:00:00.000Z'),
    lines: [
      {
        accountCode: '613200',
        accountLabel: 'Locations immobilières',
        label: null,
        allocations: [{ projectId: null, cohortCode: null }],
      },
      {
        accountCode: '512000',
        accountLabel: 'Banque',
        label: null,
        allocations: [],
      },
    ],
  });
}

/** 268 écritures plus récentes que le loyer, comme SKSR le 2026-10-22. */
function sksr(): Entry[] {
  seq = 0;
  const recent = Array.from({ length: 210 }, () => entry());
  const loyer = rent();
  const older = Array.from({ length: 58 }, () =>
    entry({ occurredAt: new Date(Date.UTC(2026, 7, 1) - seq * 3_600_000) }),
  );
  return [...recent, loyer, ...older];
}

describe('AccountingService.listEntriesPage', () => {
  it('rend le total de ce qui passe le filtre, au-delà de la page', async () => {
    const { svc } = service(sksr());
    const page = await svc.listEntriesPage('club-1', {}, 200);
    expect(page.items).toHaveLength(200);
    expect(page.totalCount).toBe(269);
    expect(page.items.map((e) => e.label)).not.toContain(
      'Loyer dojo septembre',
    );
  });

  it('charger plus : une limite plus grande atteint la 211e écriture', async () => {
    const { svc } = service(sksr());
    const page = await svc.listEntriesPage('club-1', {}, 300);
    expect(page.items).toHaveLength(269);
    expect(page.items[210].label).toBe('Loyer dojo septembre');
  });

  it('borne la limite entre 1 et le plafond', async () => {
    const { svc, prisma } = service(sksr());
    await svc.listEntriesPage('club-1', {}, 0);
    expect(prisma.accountingEntry.findMany.mock.calls[0][0].take).toBe(1);
    await svc.listEntriesPage('club-1', {}, 1_000_000);
    expect(prisma.accountingEntry.findMany.mock.calls[1][0].take).toBe(2000);
  });

  it('cherche sur toutes les écritures, pas sur la page chargée', async () => {
    const { svc } = service(sksr());
    for (const search of ['loyer', 'LOYER DOJO', '6132', 'locations']) {
      const page = await svc.listEntriesPage('club-1', { search }, 100);
      expect(page.totalCount).toBe(1);
      expect(page.items[0].label).toBe('Loyer dojo septembre');
    }
  });

  it('cherche un montant exact saisi en euros', async () => {
    const { svc } = service(sksr());
    for (const search of ['1300', '1 300', '1300,00', '1 300,00 €', '1300.0']) {
      const page = await svc.listEntriesPage('club-1', { search }, 100);
      expect(page.items.map((e) => e.label)).toEqual(['Loyer dojo septembre']);
    }
    const none = await svc.listEntriesPage('club-1', { search: '1301' }, 100);
    expect(none.totalCount).toBe(0);
  });

  it('cherche dans le n° de facture et la référence de paiement', async () => {
    seq = 0;
    const { svc } = service([
      entry({ invoiceNumber: 'FAC-2026-117' }),
      entry({ paymentReference: 'CHQ 4455' }),
      entry(),
    ]);
    const fac = await svc.listEntriesPage('club-1', { search: 'fac-2026' }, 10);
    expect(fac.items.map((e) => e.invoiceNumber)).toEqual(['FAC-2026-117']);
    const chq = await svc.listEntriesPage('club-1', { search: 'chq 44' }, 10);
    expect(chq.items.map((e) => e.paymentReference)).toEqual(['CHQ 4455']);
  });

  it('applique type, statut et compte financier côté serveur', async () => {
    seq = 0;
    const { svc } = service([
      entry({ kind: 'EXPENSE', status: 'POSTED', financialAccountId: 'fa-1' }),
      entry({ kind: 'EXPENSE', status: 'NEEDS_REVIEW', financialAccountId: 'fa-1' }),
      entry({ kind: 'EXPENSE', status: 'POSTED', financialAccountId: 'fa-2' }),
      entry({ kind: 'INCOME', status: 'POSTED', financialAccountId: 'fa-1' }),
    ]);
    const page = await svc.listEntriesPage(
      'club-1',
      { kind: 'EXPENSE' as never, status: 'POSTED' as never, financialAccountId: 'fa-1' },
      10,
    );
    expect(page.totalCount).toBe(1);
    expect(page.items[0].id).toBe('e-0001');
  });

  it('filtre par projet de ventilation, ou sans projet', async () => {
    seq = 0;
    const withProject = entry({
      lines: [
        {
          accountCode: '606800',
          accountLabel: 'Fournitures',
          label: null,
          allocations: [{ projectId: 'p-1', cohortCode: null }],
        },
      ],
    });
    const otherProject = entry({
      lines: [
        {
          accountCode: '606800',
          accountLabel: 'Fournitures',
          label: null,
          allocations: [{ projectId: 'p-2', cohortCode: null }],
        },
      ],
    });
    const noProject = entry();
    const { svc } = service([withProject, otherProject, noProject]);
    const p1 = await svc.listEntriesPage(
      'club-1',
      { allocationProjectId: 'p-1' },
      10,
    );
    expect(p1.items.map((e) => e.id)).toEqual([withProject.id]);
    const none = await svc.listEntriesPage(
      'club-1',
      { withoutAllocationProject: true },
      10,
    );
    expect(none.items.map((e) => e.id)).toEqual([noProject.id]);
  });

  it('compte et projet de ventilation peuvent viser deux lignes différentes', async () => {
    seq = 0;
    const e = entry({
      lines: [
        {
          accountCode: '606800',
          accountLabel: 'Fournitures',
          label: null,
          allocations: [{ projectId: 'p-1', cohortCode: null }],
        },
        {
          accountCode: '512000',
          accountLabel: 'Banque',
          label: null,
          allocations: [],
        },
      ],
    });
    const { svc } = service([e]);
    const page = await svc.listEntriesPage(
      'club-1',
      { accountCode: '512000', allocationProjectId: 'p-1' },
      10,
    );
    expect(page.totalCount).toBe(1);
  });

  it('borne la période : from inclus, to exclu', async () => {
    seq = 0;
    const { svc } = service([
      entry({ occurredAt: new Date('2026-09-01T00:00:00.000Z') }),
      entry({ occurredAt: new Date('2026-08-31T23:59:59.000Z') }),
      entry({ occurredAt: new Date('2027-09-01T00:00:00.000Z') }),
    ]);
    const page = await svc.listEntriesPage(
      'club-1',
      {
        from: new Date('2026-09-01T00:00:00.000Z'),
        to: new Date('2027-09-01T00:00:00.000Z'),
      },
      10,
    );
    expect(page.items.map((e) => e.id)).toEqual(['e-0001']);
  });

  it("ne rend jamais les écritures d'un autre club", async () => {
    seq = 0;
    const { svc } = service([
      entry({ label: 'Loyer dojo', clubId: 'club-2' }),
      entry({ label: 'Loyer dojo' }),
    ]);
    const page = await svc.listEntriesPage('club-1', { search: 'loyer' }, 10);
    expect(page.items.map((e) => e.clubId)).toEqual(['club-1']);
    expect(page.totalCount).toBe(1);
  });
});

describe('AccountingService.listEntries par identifiants', () => {
  it('retrouve une écriture plus ancienne que la 500e (file de revue)', async () => {
    seq = 0;
    const all = Array.from({ length: 600 }, () => entry());
    const oldest = all[599];
    const { svc } = service(all);
    const rows = await svc.listEntries('club-1', {
      ids: [oldest.id],
      limit: 1,
    });
    expect(rows.map((e) => e.id)).toEqual([oldest.id]);
  });
});

describe('parseSearchAmountCents', () => {
  it.each([
    ['1300', 130000],
    ['1 300', 130000],
    ['1 300,00 €', 130000],
    ['12,5', 1250],
    ['0.99', 99],
  ])('« %s » vaut %i centimes', (input, cents) => {
    expect(parseSearchAmountCents(input)).toBe(cents);
  });

  it.each(['loyer', '613200x', '1,234', '', '1.2.3', '99999999999'])(
    '« %s » n’est pas un montant',
    (input) => {
      expect(parseSearchAmountCents(input)).toBeNull();
    },
  );
});
