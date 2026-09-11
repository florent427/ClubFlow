import { BadRequestException } from '@nestjs/common';
import { VolunteerAdvancesService } from './volunteer-advances.service';

/**
 * Frais avancés par un bénévole (ADR-0016). Ce qui est vérifié : la
 * contrepartie bascule bien entre la trésorerie et le compte de tiers, ce
 * que le club doit se compte sur les reçus eux-mêmes, et un remboursement
 * est tout entier ou pas du tout.
 */

const CLUB = 'club-1';
const V = '467100';
const BANK = '512000';

type Line = {
  id: string;
  entryId: string;
  accountCode: string;
  accountLabel: string;
  side: string;
  debitCents: number;
  creditCents: number;
  sortOrder: number;
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
  cancelledAt: Date | null;
  financialAccountId: string | null;
  advancedByMemberId: string | null;
};

function makeWorld(opts: { entries?: Entry[]; lines?: Line[]; reimbursedEntryIds?: string[] } = {}) {
  const entries: Entry[] = opts.entries ?? [];
  const lines: Line[] = opts.lines ?? [];
  const reimbursements: Array<Record<string, unknown>> = [];
  const items: Array<{ reimbursementId: string; entryId: string; amountCents: number }> = [];
  for (const id of opts.reimbursedEntryIds ?? []) {
    items.push({ reimbursementId: 'r-old', entryId: id, amountCents: 0 });
  }
  const members = [
    { id: 'm-1', clubId: CLUB, firstName: 'Jean', lastName: 'Dupont', status: 'ACTIVE' },
    { id: 'm-2', clubId: CLUB, firstName: 'Léa', lastName: 'Martin', status: 'ACTIVE' },
  ];
  const accounts = [
    { code: V, label: 'Bénévoles, frais avancés à rembourser', isActive: true },
    { code: BANK, label: 'Banque principale', isActive: true },
  ];
  let seq = 0;
  const view = (e: Entry) => ({
    ...e,
    lines: lines.filter((l) => l.entryId === e.id).sort((a, b) => a.sortOrder - b.sortOrder),
    advancedByMember: e.advancedByMemberId
      ? members.find((m) => m.id === e.advancedByMemberId)
      : null,
  });
  const isReimbursed = (id: string) => items.some((i) => i.entryId === id);

  const prisma: Record<string, unknown> = {
    accountingEntry: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const e = entries.find((x) => x.id === where.id);
        return e ? view(e) : null;
      }),
      findFirstOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
        view(entries.find((x) => x.id === where.id)!),
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            advancedByMemberId: string | { not: null };
            reimbursementItems?: unknown;
          };
        }) => {
          const wanted =
            typeof where.advancedByMemberId === 'string' ? where.advancedByMemberId : null;
          // Fidèle à la requête : sans le filtre `reimbursementItems`, les
          // reçus déjà remboursés reviennent — c'est ce que le test doit voir.
          const excludeReimbursed = where.reimbursementItems !== undefined;
          return entries
            .filter(
              (e) =>
                e.advancedByMemberId !== null &&
                (!wanted || e.advancedByMemberId === wanted) &&
                e.cancelledAt === null &&
                (e.status === 'POSTED' || e.status === 'LOCKED') &&
                (!excludeReimbursed || !isReimbursed(e.id)),
            )
            .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
            .map(view);
        },
      ),
      create: jest.fn(async ({ data }: { data: Omit<Entry, 'id'> }) => {
        const e = { ...data, id: `entry-${++seq}`, cancelledAt: null } as Entry;
        entries.push(e);
        return e;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Entry> }) => {
        const e = entries.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Omit<Line, 'id'> }) => {
        const l = { ...data, id: `l-${++seq}` };
        lines.push(l);
        return l;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Line> }) => {
        const l = lines.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      }),
    },
    member: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; status?: string } }) =>
        members.find((m) => m.id === where.id && (!where.status || m.status === where.status)) ??
        null,
      ),
    },
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_code: { code: string } } }) =>
        accounts.find((a) => a.code === where.clubId_code.code) ?? null,
      ),
    },
    volunteerReimbursement: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const r = { ...data, id: `r-${++seq}`, status: 'POSTED' };
        reimbursements.push(r);
        return r;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const r = reimbursements.find((x) => x.id === where.id);
        return r ? { ...r, member: members[0], financialAccount: { id: 'fa-1', label: 'Banque principale' }, items: [] } : null;
      }),
      findMany: jest.fn(async () => reimbursements),
    },
    volunteerReimbursementItem: {
      createMany: jest.fn(
        async ({ data }: { data: Array<{ reimbursementId: string; entryId: string; amountCents: number }> }) => {
          items.push(...data);
          return { count: data.length };
        },
      ),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  const audit = { log: jest.fn(async () => undefined) };
  const period = { assertDateIsOpen: jest.fn(async () => undefined) };
  const financialAccounts = {
    getById: jest.fn(async () => ({
      id: 'fa-1',
      kind: 'BANK',
      isActive: true,
      accountingAccount: { code: BANK },
    })),
    getDefault: jest.fn(async () => ({ id: 'fa-1', accountingAccount: { code: BANK } })),
  };
  // Le relevé qui portera le virement n'est pas toujours déjà déposé : ce
  // double dit « aucune ligne à rapprocher », le cas ordinaire.
  const reconciliation = { matchExistingLineForEntry: jest.fn(async () => null) };
  const svc = new VolunteerAdvancesService(
    prisma as never,
    audit as never,
    period as never,
    financialAccounts as never,
    reconciliation as never,
  );
  return {
    svc,
    entries,
    lines,
    items,
    reimbursements,
    audit,
    period,
    financialAccounts,
    reconciliation,
  };
}

function receipt(id: string, over: Partial<Entry> = {}): { entry: Entry; lines: Line[] } {
  const entry: Entry = {
    id,
    clubId: CLUB,
    kind: 'EXPENSE',
    status: 'NEEDS_REVIEW',
    source: 'OCR_AI',
    label: 'Essence déplacement',
    amountCents: 4510,
    occurredAt: new Date('2026-09-05T00:00:00.000Z'),
    cancelledAt: null,
    financialAccountId: 'fa-1',
    advancedByMemberId: null,
    ...over,
  };
  return {
    entry,
    lines: [
      {
        id: `${id}-charge`,
        entryId: id,
        accountCode: '606100',
        accountLabel: 'Carburant',
        side: 'DEBIT',
        debitCents: entry.amountCents,
        creditCents: 0,
        sortOrder: 0,
      },
      {
        id: `${id}-cash`,
        entryId: id,
        accountCode: over.advancedByMemberId ? V : BANK,
        accountLabel: over.advancedByMemberId ? 'Bénévoles' : 'Banque principale',
        side: 'CREDIT',
        debitCents: 0,
        creditCents: entry.amountCents,
        sortOrder: 1,
      },
    ],
  };
}

describe('VolunteerAdvancesService.setAdvancedBy', () => {
  it('désigner un bénévole bascule la contrepartie sur 467100 et détache la trésorerie', async () => {
    const r = receipt('e-1');
    const w = makeWorld({ entries: [r.entry], lines: r.lines });
    await w.svc.setAdvancedBy(CLUB, 'user-1', 'e-1', 'm-1');

    expect(w.lines.find((l) => l.id === 'e-1-cash')).toMatchObject({
      accountCode: V,
      side: 'CREDIT',
      creditCents: 4510,
    });
    expect(w.entries[0]).toMatchObject({ advancedByMemberId: 'm-1', financialAccountId: null });
    // La charge n'a pas bougé : c'est la contrepartie qui change, pas la dépense.
    expect(w.lines.find((l) => l.id === 'e-1-charge')).toMatchObject({ accountCode: '606100' });
  });

  it('retirer le bénévole rend la dépense au club, sur sa banque par défaut', async () => {
    const r = receipt('e-1', { advancedByMemberId: 'm-1', financialAccountId: null });
    const w = makeWorld({ entries: [r.entry], lines: r.lines });
    await w.svc.setAdvancedBy(CLUB, 'user-1', 'e-1', null);

    expect(w.lines.find((l) => l.id === 'e-1-cash')).toMatchObject({ accountCode: BANK });
    expect(w.entries[0]).toMatchObject({ advancedByMemberId: null, financialAccountId: 'fa-1' });
  });

  it('une écriture comptabilisée est refusée : la correction passe par une contre-passation', async () => {
    const r = receipt('e-1', { status: 'POSTED' });
    const w = makeWorld({ entries: [r.entry], lines: r.lines });
    await expect(w.svc.setAdvancedBy(CLUB, 'user-1', 'e-1', 'm-1')).rejects.toThrow(
      /contre-passation/,
    );
    expect(w.entries[0].advancedByMemberId).toBeNull();
  });

  it('une recette n’est pas une avance de bénévole', async () => {
    const r = receipt('e-1', { kind: 'INCOME' });
    const w = makeWorld({ entries: [r.entry], lines: r.lines });
    await expect(w.svc.setAdvancedBy(CLUB, 'user-1', 'e-1', 'm-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('un mois verrouillé bloque la bascule', async () => {
    const r = receipt('e-1');
    const w = makeWorld({ entries: [r.entry], lines: r.lines });
    w.period.assertDateIsOpen.mockRejectedValueOnce(new Error('période verrouillée'));
    await expect(w.svc.setAdvancedBy(CLUB, 'user-1', 'e-1', 'm-1')).rejects.toThrow(/verrouillée/);
  });
});

describe('VolunteerAdvancesService.balances / openItems', () => {
  function world() {
    const a = receipt('e-1', { status: 'POSTED', advancedByMemberId: 'm-1', amountCents: 4510 });
    const b = receipt('e-2', {
      status: 'POSTED',
      advancedByMemberId: 'm-1',
      amountCents: 3000,
      occurredAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const c = receipt('e-3', { status: 'POSTED', advancedByMemberId: 'm-2', amountCents: 1230 });
    const cancelled = receipt('e-4', {
      status: 'POSTED',
      advancedByMemberId: 'm-1',
      amountCents: 9999,
      cancelledAt: new Date(),
    });
    const draft = receipt('e-5', { status: 'NEEDS_REVIEW', advancedByMemberId: 'm-1', amountCents: 5000 });
    return makeWorld({
      entries: [a.entry, b.entry, c.entry, cancelled.entry, draft.entry],
      lines: [...a.lines, ...b.lines, ...c.lines, ...cancelled.lines, ...draft.lines],
    });
  }

  it('le club doit à chacun la somme de ses reçus ouverts, le plus ancien en tête', async () => {
    const w = world();
    const balances = await w.svc.balances(CLUB);
    expect(balances).toEqual([
      {
        memberId: 'm-1',
        firstName: 'Jean',
        lastName: 'Dupont',
        openCents: 7510,
        openCount: 2,
        oldestOccurredAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        memberId: 'm-2',
        firstName: 'Léa',
        lastName: 'Martin',
        openCents: 1230,
        openCount: 1,
        oldestOccurredAt: new Date('2026-09-05T00:00:00.000Z'),
      },
    ]);
  });

  it('un reçu annulé ou non comptabilisé ne compte pas', async () => {
    const w = world();
    const items = await w.svc.openItems(CLUB, 'm-1');
    expect(items.map((i) => i.entryId)).toEqual(['e-2', 'e-1']);
    expect(items[0]).toMatchObject({ amountCents: 3000, accountCode: '606100' });
  });

  it('un reçu déjà remboursé sort du solde', async () => {
    const a = receipt('e-1', { status: 'POSTED', advancedByMemberId: 'm-1', amountCents: 4510 });
    const w = makeWorld({ entries: [a.entry], lines: a.lines, reimbursedEntryIds: ['e-1'] });
    expect(await w.svc.balances(CLUB)).toEqual([]);
  });
});

describe('VolunteerAdvancesService.recordReimbursement', () => {
  function world() {
    const a = receipt('e-1', { status: 'POSTED', advancedByMemberId: 'm-1', amountCents: 4510 });
    const b = receipt('e-2', { status: 'POSTED', advancedByMemberId: 'm-1', amountCents: 3000 });
    const other = receipt('e-3', { status: 'POSTED', advancedByMemberId: 'm-2', amountCents: 1230 });
    return makeWorld({
      entries: [a.entry, b.entry, other.entry],
      lines: [...a.lines, ...b.lines, ...other.lines],
    });
  }
  const paidOn = new Date('2026-09-20T00:00:00.000Z');

  it('une seule écriture pour N reçus : 467100 au débit, la banque au crédit', async () => {
    const w = world();
    await w.svc.recordReimbursement(CLUB, 'user-1', {
      memberId: 'm-1',
      financialAccountId: 'fa-1',
      paidOn,
      entryIds: ['e-1', 'e-2'],
    });

    const entry = w.entries.find((e) => e.source === 'VOLUNTEER_REIMBURSEMENT')!;
    expect(entry).toMatchObject({
      kind: 'TRANSFER',
      status: 'POSTED',
      amountCents: 7510,
      occurredAt: paidOn,
      financialAccountId: 'fa-1',
    });
    expect(entry.label).toBe('Remboursement Jean Dupont (2 reçus)');
    const entryLines = w.lines.filter((l) => l.entryId === entry.id);
    expect(entryLines).toHaveLength(2);
    expect(entryLines[0]).toMatchObject({ accountCode: V, side: 'DEBIT', debitCents: 7510 });
    expect(entryLines[1]).toMatchObject({ accountCode: BANK, side: 'CREDIT', creditCents: 7510 });
    expect(w.items.map((i) => i.entryId)).toEqual(['e-1', 'e-2']);
    expect(w.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VOLUNTEER_REIMBURSEMENT' }),
    );
  });

  it('après remboursement, le bénévole ne doit plus rien', async () => {
    const w = world();
    await w.svc.recordReimbursement(CLUB, 'user-1', {
      memberId: 'm-1',
      financialAccountId: 'fa-1',
      paidOn,
      entryIds: ['e-1', 'e-2'],
    });
    const balances = await w.svc.balances(CLUB);
    expect(balances.map((b) => b.memberId)).toEqual(['m-2']);
  });

  it('un reçu d’un autre bénévole est refusé, et rien n’est écrit', async () => {
    const w = world();
    await expect(
      w.svc.recordReimbursement(CLUB, 'user-1', {
        memberId: 'm-1',
        financialAccountId: 'fa-1',
        paidOn,
        entryIds: ['e-1', 'e-3'],
      }),
    ).rejects.toThrow(/plus à rembourser/);
    expect(w.entries.some((e) => e.source === 'VOLUNTEER_REIMBURSEMENT')).toBe(false);
    expect(w.items).toHaveLength(0);
  });

  it('un reçu déjà remboursé est refusé', async () => {
    const a = receipt('e-1', { status: 'POSTED', advancedByMemberId: 'm-1', amountCents: 4510 });
    const w = makeWorld({ entries: [a.entry], lines: a.lines, reimbursedEntryIds: ['e-1'] });
    await expect(
      w.svc.recordReimbursement(CLUB, 'user-1', {
        memberId: 'm-1',
        financialAccountId: 'fa-1',
        paidOn,
        entryIds: ['e-1'],
      }),
    ).rejects.toThrow(/plus à rembourser/);
  });

  it('un compte de transit n’est pas un compte d’où l’on rembourse', async () => {
    const w = world();
    w.financialAccounts.getById.mockResolvedValueOnce({
      id: 'fa-2',
      kind: 'STRIPE_TRANSIT',
      isActive: true,
      accountingAccount: { code: '512300' },
    });
    await expect(
      w.svc.recordReimbursement(CLUB, 'user-1', {
        memberId: 'm-1',
        financialAccountId: 'fa-2',
        paidOn,
        entryIds: ['e-1'],
      }),
    ).rejects.toThrow(/banque ou une caisse/);
  });

  it('aucun reçu, ou deux fois le même : refusé', async () => {
    const w = world();
    await expect(
      w.svc.recordReimbursement(CLUB, 'user-1', {
        memberId: 'm-1',
        financialAccountId: 'fa-1',
        paidOn,
        entryIds: [],
      }),
    ).rejects.toThrow(/Aucun reçu/);
    await expect(
      w.svc.recordReimbursement(CLUB, 'user-1', {
        memberId: 'm-1',
        financialAccountId: 'fa-1',
        paidOn,
        entryIds: ['e-1', 'e-1'],
      }),
    ).rejects.toThrow(/deux fois/);
  });
});
