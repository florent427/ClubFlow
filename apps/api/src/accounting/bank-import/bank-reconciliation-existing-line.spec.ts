import { BankReconciliationService } from './bank-reconciliation.service';
import { CategorizationLearningService } from './categorization-learning.service';

/**
 * L'ordre inverse : l'écriture naît APRÈS que le relevé soit déposé.
 *
 * Un remboursement de bénévole ou un dépôt d'espèces est saisi une fois le
 * relevé du mois déjà importé ; sa ligne attend alors sans rien pour la
 * rattacher, et la catégorisation finirait par en faire une dépense de plus.
 * `matchExistingLineForEntry` va la chercher — mais seulement quand elle est
 * le seul candidat, sinon c'est au trésorier de trancher.
 */

const CLUB = 'club-1';
const BANK = '512000';
const FA = 'fa-bank';

type StatementLine = {
  id: string;
  clubId: string;
  statementId: string;
  financialAccountId: string;
  status: string;
  proposedEntryId: string | null;
  bookedOn: Date;
  amountCents: number;
  label: string;
  reference: string | null;
  statementStatus: string;
};

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const OUT_OF_RANGE = ['NEEDS_CHECK', 'FAILED', 'PARSING'];

function makeWorld(
  over: {
    entry?: Partial<{
      amountCents: number;
      occurredAt: Date;
      status: string;
      cancelledAt: Date | null;
      financialAccountId: string | null;
      cashDebit: boolean;
      alreadyMatched: boolean;
    }>;
    lines?: Array<Partial<StatementLine>>;
  } = {},
) {
  const e = {
    amountCents: 8740,
    occurredAt: day('2026-09-11'),
    status: 'POSTED',
    cancelledAt: null as Date | null,
    financialAccountId: FA as string | null,
    // Trésorerie au crédit : l'argent sort, la ligne du relevé est négative.
    cashDebit: false,
    alreadyMatched: false,
    ...(over.entry ?? {}),
  };
  const entry = {
    id: 'entry-1',
    label: 'Remboursement Florent Morel (3 reçus)',
    amountCents: e.amountCents,
    occurredAt: e.occurredAt,
    status: e.status,
    cancelledAt: e.cancelledAt,
    financialAccountId: e.financialAccountId,
    lines: [
      { accountCode: '467100', debitCents: e.cashDebit ? 0 : e.amountCents },
      { accountCode: BANK, debitCents: e.cashDebit ? e.amountCents : 0 },
    ],
    bankMatches: e.alreadyMatched ? [{ id: 'm-0', lineId: 'l-9', amountCents: e.amountCents }] : [],
  };

  const lines: StatementLine[] = (
    over.lines ?? [{}]
  ).map((l, i) => ({
    id: l.id ?? `l-${i + 1}`,
    clubId: CLUB,
    statementId: l.statementId ?? 'st-1',
    financialAccountId: l.financialAccountId ?? FA,
    status: l.status ?? 'UNMATCHED',
    proposedEntryId: l.proposedEntryId ?? null,
    bookedOn: l.bookedOn ?? day('2026-09-12'),
    amountCents: l.amountCents ?? -8740,
    label: l.label ?? 'VIR SEPA FLORENT MOREL REMB FRAIS',
    reference: l.reference ?? null,
    statementStatus: l.statementStatus ?? 'READY',
  }));

  // Les écritures NEEDS_REVIEW nées d'une proposition de l'IA sur une ligne.
  const proposals = [
    { id: 'prop-review', clubId: CLUB, status: 'NEEDS_REVIEW' },
    { id: 'prop-posted', clubId: CLUB, status: 'POSTED' },
  ];
  const deletedEntries: string[] = [];
  const matches: Array<Record<string, unknown>> = [];
  const flagged: Array<{ entryId: string; accountCode: string }> = [];
  const statements = [
    { id: 'st-1', clubId: CLUB, status: 'READY', integrityDeltaCents: 0, chainOk: true },
  ];

  const prisma: Record<string, unknown> = {
    accountingEntry: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        proposals.filter((p) => where.id.in.includes(p.id) && !deletedEntries.includes(p.id)),
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        deletedEntries.push(where.id);
        return { id: where.id };
      }),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            cancelledAt?: null;
            status?: { in: string[] } | string;
            financialAccountId?: string;
          };
        }) => {
          const proposal = proposals.find((p) => p.id === where.id);
          if (proposal) {
            if (deletedEntries.includes(proposal.id)) return null;
            // `dropPendingProposal` ne supprime qu'une proposition en revue.
            if (typeof where.status === 'string' && proposal.status !== where.status) return null;
            return proposal;
          }
          if (where.id !== entry.id) return null;
          if (where.cancelledAt === null && entry.cancelledAt !== null) return null;
          if (where.status && typeof where.status !== 'string' && !where.status.in.includes(entry.status)) {
            return null;
          }
          if (
            where.financialAccountId !== undefined &&
            entry.financialAccountId !== where.financialAccountId
          ) {
            return null;
          }
          return entry;
        },
      ),
    },
    clubFinancialAccount: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === FA ? { accountingAccount: { code: BANK } } : null,
      ),
    },
    bankStatementLine: {
      // Fidèle à la requête : chaque clause écarte vraiment des lignes,
      // sinon un filtre oublié dans le service passerait inaperçu.
      findMany: jest.fn(
        async ({
          where,
          take,
        }: {
          where: {
            financialAccountId?: string;
            status?: string;
            proposedEntryId?: string | null;
            amountCents?: number;
            bookedOn?: { gte: Date; lt: Date };
            statement?: { status?: { notIn: string[] } };
          };
          take?: number;
        }) => {
          const kept = lines.filter((l) => {
            if (
              where.financialAccountId !== undefined &&
              l.financialAccountId !== where.financialAccountId
            ) {
              return false;
            }
            if (where.status !== undefined && l.status !== where.status) return false;
            if (where.proposedEntryId === null && l.proposedEntryId !== null) return false;
            if (where.amountCents !== undefined && l.amountCents !== where.amountCents) return false;
            if (where.bookedOn) {
              if (l.bookedOn.getTime() < where.bookedOn.gte.getTime()) return false;
              if (l.bookedOn.getTime() >= where.bookedOn.lt.getTime()) return false;
            }
            const notIn = where.statement?.status?.notIn;
            if (notIn && notIn.includes(l.statementStatus)) return false;
            return true;
          });
          return take ? kept.slice(0, take) : kept;
        },
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const l = lines.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      }),
    },
    bankStatementLineMatch: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        matches.push(data);
        return data;
      }),
    },
    accountingEntryLine: {
      updateMany: jest.fn(
        async ({ where }: { where: { entryId: string; accountCode: string } }) => {
          flagged.push({ entryId: where.entryId, accountCode: where.accountCode });
          return { count: 1 };
        },
      ),
    },
    bankStatement: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const st = statements.find((s) => s.id === where.id);
        return st
          ? { ...st, lines: lines.filter((l) => l.statementId === st.id).map((l) => ({ status: l.status })) }
          : null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const st = statements.find((s) => s.id === where.id)!;
        st.status = data.status;
        return st;
      }),
    },
  };
  (prisma as { $transaction: unknown }).$transaction = jest.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  );

  const svc = new BankReconciliationService(
    prisma as never,
    { log: jest.fn(async () => undefined) } as never,
    new CategorizationLearningService(prisma as never),
  );
  return { svc, lines, matches, flagged, statements, prisma, deletedEntries };
}

describe('BankReconciliationService.matchExistingLineForEntry', () => {
  it('rapproche la ligne du relevé déjà déposé quand elle est le seul candidat', async () => {
    const w = makeWorld();
    const statementId = await w.svc.matchExistingLineForEntry(CLUB, 'entry-1');

    expect(statementId).toBe('st-1');
    expect(w.matches[0]).toMatchObject({
      lineId: 'l-1',
      entryId: 'entry-1',
      amountCents: 8740,
      origin: 'AUTO',
    });
    expect(w.lines[0].status).toBe('MATCHED');
    // Le marqueur va sur la trésorerie, pas sur le compte de tiers.
    expect(w.flagged).toEqual([{ entryId: 'entry-1', accountCode: BANK }]);
    expect(w.statements[0].status).toBe('RECONCILED');
  });

  it('ne touche à rien quand deux lignes du même montant conviennent', async () => {
    const w = makeWorld({ lines: [{ id: 'l-1' }, { id: 'l-2', bookedOn: day('2026-09-13') }] });
    const statementId = await w.svc.matchExistingLineForEntry(CLUB, 'entry-1');

    expect(statementId).toBeNull();
    expect(w.matches).toHaveLength(0);
    expect(w.lines.map((l) => l.status)).toEqual(['UNMATCHED', 'UNMATCHED']);
  });

  it('laisse une ligne de sens opposé tranquille', async () => {
    // L'écriture sort l'argent : une ligne créditrice du même montant n'est
    // pas la sienne.
    const w = makeWorld({ lines: [{ amountCents: 8740 }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
    expect(w.matches).toHaveLength(0);
  });

  it('suit le sens de la trésorerie : une écriture qui encaisse cherche une ligne créditrice', async () => {
    const w = makeWorld({ entry: { cashDebit: true }, lines: [{ amountCents: 8740 }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBe('st-1');
    expect(w.matches).toHaveLength(1);
  });

  it('ignore une ligne d’un autre compte financier', async () => {
    // Même montant, même jour, mais sur la caisse : ce n'est pas ce
    // virement-là.
    const w = makeWorld({ lines: [{ financialAccountId: 'fa-cash' }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
    expect(w.matches).toHaveLength(0);
  });

  it('ignore une ligne hors de la fenêtre de rapprochement', async () => {
    const w = makeWorld({ lines: [{ bookedOn: day('2026-10-15') }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
  });

  it('passe devant une proposition de l’IA restée en revue, et la jette', async () => {
    // La catégorisation tourne dès l'import : une ligne orpheline porte
    // presque toujours une proposition quand l'écriture réelle arrive.
    const w = makeWorld({ lines: [{ proposedEntryId: 'prop-review' }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBe('st-1');
    expect(w.matches).toHaveLength(1);
    expect(w.lines[0].proposedEntryId).toBeNull();
    // Sans cela, valider la proposition compterait la somme une seconde fois.
    expect(w.deletedEntries).toEqual(['prop-review']);
  });

  it('ne passe pas devant une proposition déjà comptabilisée', async () => {
    const w = makeWorld({ lines: [{ proposedEntryId: 'prop-posted' }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
    expect(w.matches).toHaveLength(0);
    expect(w.deletedEntries).toEqual([]);
  });

  it.each(OUT_OF_RANGE)('ignore une ligne d’un relevé %s', async (statementStatus) => {
    const w = makeWorld({ lines: [{ statementStatus }] });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
  });

  it('ne recouvre pas une écriture déjà rapprochée', async () => {
    const w = makeWorld({ entry: { alreadyMatched: true } });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
    expect(w.matches).toHaveLength(0);
  });

  it('ne fait rien d’une écriture sans compte financier', async () => {
    const w = makeWorld({ entry: { financialAccountId: null } });
    expect(await w.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
  });

  it('ne fait rien d’une écriture annulée ou encore en revue', async () => {
    const cancelled = makeWorld({ entry: { cancelledAt: new Date() } });
    expect(await cancelled.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();

    const review = makeWorld({ entry: { status: 'NEEDS_REVIEW' } });
    expect(await review.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
  });

  it('ignore une ligne déjà rapprochée ou ignorée', async () => {
    const matched = makeWorld({ lines: [{ status: 'MATCHED' }] });
    expect(await matched.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();

    const ignored = makeWorld({ lines: [{ status: 'IGNORED' }] });
    expect(await ignored.svc.matchExistingLineForEntry(CLUB, 'entry-1')).toBeNull();
  });
});
