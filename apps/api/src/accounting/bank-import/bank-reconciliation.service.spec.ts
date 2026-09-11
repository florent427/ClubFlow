import { BadRequestException } from '@nestjs/common';
import type { AccountingAuditService } from '../accounting-audit.service';
import { parseIsoDate } from '../accounting-fiscal-year.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BankReconciliationService } from './bank-reconciliation.service';

/**
 * Double Prisma en mémoire, fidèle aux requêtes que le service émet :
 * filtres de fenêtre, de sens et de couverture sur les écritures, marqueur
 * `bankReconciledAt` sur les lignes de trésorerie, liaisons N↔N. Les tests
 * lisent l'ÉTAT persisté, jamais la forme des appels.
 */
const CLUB = 'club-1';
const FIN = 'fin-bank';
const CASH = '512000';

type CashLine = { accountCode: string; debitCents: number; creditCents: number; bankReconciledAt: Date | null };
type Entry = {
  id: string;
  clubId: string;
  financialAccountId: string;
  status: string;
  cancelledAt: Date | null;
  occurredAt: Date;
  amountCents: number;
  label: string;
  kind: string;
  source: string;
  stripePayoutId: string | null;
  paymentReference: string | null;
  payment: { externalRef: string | null } | null;
  lines: CashLine[];
};
type Line = {
  id: string;
  clubId: string;
  statementId: string;
  financialAccountId: string;
  bookedOn: Date;
  amountCents: number;
  label: string;
  reference: string | null;
  status: string;
  candidateEntryIds: string[];
  ignoreReason: string | null;
  ignoreNote: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
};
type Match = { id: string; clubId: string; lineId: string; entryId: string; amountCents: number; origin: string; matchedByUserId: string | null };

function entry(
  id: string,
  iso: string,
  amountCents: number,
  side: 'DEBIT' | 'CREDIT',
  extra: Partial<Entry> = {},
): Entry {
  return {
    id,
    clubId: CLUB,
    financialAccountId: FIN,
    status: 'POSTED',
    cancelledAt: null,
    occurredAt: parseIsoDate(iso),
    amountCents,
    label: `Écriture ${id}`,
    kind: side === 'DEBIT' ? 'INCOME' : 'EXPENSE',
    source: 'MANUAL',
    stripePayoutId: null,
    paymentReference: null,
    payment: null,
    lines: [
      {
        accountCode: CASH,
        debitCents: side === 'DEBIT' ? amountCents : 0,
        creditCents: side === 'CREDIT' ? amountCents : 0,
        bankReconciledAt: null,
      },
    ],
    ...extra,
  };
}

function line(id: string, iso: string, amountCents: number, label = `Ligne ${id}`, reference: string | null = null): Line {
  return {
    id,
    clubId: CLUB,
    statementId: 'st-1',
    financialAccountId: FIN,
    bookedOn: parseIsoDate(iso),
    amountCents,
    label,
    reference,
    status: 'UNMATCHED',
    candidateEntryIds: [],
    ignoreReason: null,
    ignoreNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

function makeWorld(entries: Entry[], lines: Line[]) {
  const state = {
    entries,
    lines,
    matches: [] as Match[],
    statement: { id: 'st-1', clubId: CLUB, financialAccountId: FIN, status: 'READY', integrityDeltaCents: 0, chainOk: true },
  };
  let seq = 0;
  const withEntry = (m: Match) => ({
    ...m,
    entry: (() => {
      const e = state.entries.find((x) => x.id === m.entryId)!;
      return { id: e.id, label: e.label, occurredAt: e.occurredAt, kind: e.kind, source: e.source, amountCents: e.amountCents };
    })(),
  });
  const statementView = () => ({
    ...state.statement,
    financialAccount: { accountingAccount: { code: CASH } },
  });
  // Annoté explicitement : `$transaction` se rappelle lui-même.
  const prisma: Record<string, unknown> = {
    bankStatement: {
      findFirst: jest.fn(async ({ where, include }: { where: { id: string }; include?: { lines?: { where?: { status?: { in: string[] } } } } }) => {
        if (where.id !== state.statement.id) return null;
        const wanted = include?.lines?.where?.status?.in;
        return {
          ...statementView(),
          lines: state.lines.filter((l) => !wanted || wanted.includes(l.status)),
        };
      }),
      update: jest.fn(async ({ data }: { data: { status: string } }) => {
        state.statement.status = data.status;
        return state.statement;
      }),
    },
    bankStatementLine: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const l = state.lines.find((x) => x.id === where.id);
        if (!l) return null;
        return {
          ...l,
          matches: state.matches.filter((m) => m.lineId === l.id).map(withEntry),
          statement: statementView(),
        };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Line> }) => {
        const l = state.lines.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      }),
    },
    bankStatementLineMatch: {
      create: jest.fn(async ({ data }: { data: Omit<Match, 'id'> }) => {
        const m = { ...data, id: `m-${++seq}` };
        state.matches.push(m);
        return m;
      }),
      deleteMany: jest.fn(async ({ where }: { where: { lineId: string } }) => {
        const before = state.matches.length;
        state.matches = state.matches.filter((m) => m.lineId !== where.lineId);
        return { count: before - state.matches.length };
      }),
    },
    accountingEntry: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            financialAccountId: string;
            status: { in: string[] };
            occurredAt: { gte: Date; lt: Date };
            amountCents?: number;
            lines: { some: { accountCode: string; bankReconciledAt: null } };
          };
        }) =>
          state.entries
            .filter(
              (e) =>
                e.clubId === CLUB &&
                e.financialAccountId === where.financialAccountId &&
                where.status.in.includes(e.status) &&
                e.cancelledAt === null &&
                e.occurredAt >= where.occurredAt.gte &&
                e.occurredAt < where.occurredAt.lt &&
                (where.amountCents === undefined || e.amountCents === where.amountCents) &&
                e.lines.some((l) => l.accountCode === where.lines.some.accountCode && l.bankReconciledAt === null),
            )
            .map((e) => ({
              ...e,
              lines: e.lines.map((l) => ({ ...l })),
              bankMatches: state.matches.filter((m) => m.entryId === e.id).map((m) => ({ lineId: m.lineId, amountCents: m.amountCents })),
            })),
      ),
      findFirst: jest.fn(async ({ where }: { where: { id: string; financialAccountId: string; status: { in: string[] } } }) => {
        const e = state.entries.find(
          (x) =>
            x.id === where.id &&
            x.financialAccountId === where.financialAccountId &&
            where.status.in.includes(x.status) &&
            x.cancelledAt === null,
        );
        if (!e) return null;
        return {
          ...e,
          bankMatches: state.matches.filter((m) => m.entryId === e.id).map((m) => ({ lineId: m.lineId, amountCents: m.amountCents })),
        };
      }),
    },
    accountingEntryLine: {
      updateMany: jest.fn(
        async ({ where, data }: { where: { entryId?: string | { in: string[] }; accountCode: string }; data: { bankReconciledAt: Date | null } }) => {
          const ids = typeof where.entryId === 'string' ? [where.entryId] : where.entryId?.in ?? [];
          let count = 0;
          for (const e of state.entries.filter((x) => ids.includes(x.id))) {
            for (const l of e.lines.filter((x) => x.accountCode === where.accountCode)) {
              l.bankReconciledAt = data.bankReconciledAt;
              count++;
            }
          }
          return { count };
        },
      ),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new BankReconciliationService(
    prisma as unknown as PrismaService,
    audit as unknown as AccountingAuditService,
  );
  return { svc, state, audit };
}

const reconciled = (e: Entry) => e.lines[0].bankReconciledAt !== null;

describe('BankReconciliationService.autoMatch', () => {
  it('candidat unique sur montant, date et sens : rapproché, écriture marquée', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 25000, 'DEBIT')],
      [line('l1', '2026-09-03', 25000)],
    );
    const r = await svc.autoMatch(CLUB, 'st-1');
    expect(r).toEqual({ matched: 1, suggested: 0, unmatched: 0 });
    expect(state.lines[0].status).toBe('MATCHED');
    expect(state.matches).toEqual([expect.objectContaining({ lineId: 'l1', entryId: 'e1', amountCents: 25000, origin: 'AUTO' })]);
    expect(reconciled(state.entries[0])).toBe(true);
    expect(state.statement.status).toBe('RECONCILED');
  });

  it('deux écritures plausibles : suggérées, rien de posé', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 25000, 'DEBIT'), entry('e2', '2026-09-02', 25000, 'DEBIT')],
      [line('l1', '2026-09-03', 25000)],
    );
    const r = await svc.autoMatch(CLUB, 'st-1');
    expect(r.suggested).toBe(1);
    expect(state.lines[0].status).toBe('SUGGESTED');
    expect(state.lines[0].candidateEntryIds.sort()).toEqual(['e1', 'e2']);
    expect(state.matches).toHaveLength(0);
    expect(state.statement.status).toBe('READY');
  });

  it('clé forte : parmi deux candidats, le virement Stripe l’emporte quand la ligne dit STRIPE', async () => {
    const { svc, state } = makeWorld(
      [
        entry('e1', '2026-09-01', 25000, 'DEBIT'),
        entry('e2', '2026-09-02', 25000, 'DEBIT', { stripePayoutId: 'po_1', source: 'AUTO_STRIPE_PAYOUT', kind: 'TRANSFER' }),
      ],
      [line('l1', '2026-09-03', 25000, 'VIR STRIPE PAYMENTS UK LTD')],
    );
    await svc.autoMatch(CLUB, 'st-1');
    expect(state.matches.map((m) => m.entryId)).toEqual(['e2']);
  });

  it('clé forte : la référence du paiement présente dans le libellé', async () => {
    const { svc, state } = makeWorld(
      [
        entry('e1', '2026-09-01', 25000, 'DEBIT', { payment: { externalRef: 'VIR-7788' } }),
        entry('e2', '2026-09-02', 25000, 'DEBIT'),
      ],
      [line('l1', '2026-09-03', 25000, 'VIR SEPA DUPONT VIR-7788')],
    );
    await svc.autoMatch(CLUB, 'st-1');
    expect(state.matches.map((m) => m.entryId)).toEqual(['e1']);
  });

  it('sens : un débit du relevé ne se rapproche pas d’une recette, mais d’une dépense', async () => {
    const { svc, state } = makeWorld(
      [entry('recette', '2026-09-03', 4510, 'DEBIT'), entry('depense', '2026-09-03', 4510, 'CREDIT')],
      [line('l1', '2026-09-03', -4510)],
    );
    await svc.autoMatch(CLUB, 'st-1');
    expect(state.matches.map((m) => m.entryId)).toEqual(['depense']);
  });

  it('fenêtre : une écriture à 20 jours n’est pas candidate', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-08-14', 25000, 'DEBIT')],
      [line('l1', '2026-09-03', 25000)],
    );
    const r = await svc.autoMatch(CLUB, 'st-1');
    expect(r.unmatched).toBe(1);
    expect(state.matches).toHaveLength(0);
  });

  it('une écriture VERROUILLÉE se rapproche : rien ne change à ses montants', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 25000, 'DEBIT', { status: 'LOCKED' })],
      [line('l1', '2026-09-03', 25000)],
    );
    await svc.autoMatch(CLUB, 'st-1');
    expect(reconciled(state.entries[0])).toBe(true);
  });

  it('refuse un relevé qui n’a pas passé le contrôle d’intégrité', async () => {
    const { svc, state } = makeWorld([], [line('l1', '2026-09-03', 1)]);
    state.statement.status = 'NEEDS_CHECK';
    await expect(svc.autoMatch(CLUB, 'st-1')).rejects.toThrow(BadRequestException);
  });
});

describe('BankReconciliationService.match / unmatch (manuel, N↔N)', () => {
  it('une ligne pour deux écritures : les parts couvrent la ligne, les deux écritures sont marquées', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 10000, 'DEBIT'), entry('e2', '2026-09-01', 20000, 'DEBIT')],
      [line('l1', '2026-09-03', 30000)],
    );
    await svc.match(CLUB, 'u', 'l1', [
      { entryId: 'e1', amountCents: 10000 },
      { entryId: 'e2', amountCents: 20000 },
    ]);
    expect(state.lines[0].status).toBe('MATCHED');
    expect(state.entries.every(reconciled)).toBe(true);
  });

  it('refuse des parts qui ne couvrent pas exactement la ligne', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 10000, 'DEBIT')],
      [line('l1', '2026-09-03', 30000)],
    );
    await expect(svc.match(CLUB, 'u', 'l1', [{ entryId: 'e1', amountCents: 10000 }])).rejects.toThrow(
      BadRequestException,
    );
    expect(state.matches).toHaveLength(0);
    expect(state.lines[0].status).toBe('UNMATCHED');
  });

  it('une écriture pour deux lignes : marquée seulement quand la seconde part arrive', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 30000, 'DEBIT')],
      [line('l1', '2026-09-03', 10000), line('l2', '2026-09-04', 20000)],
    );
    await svc.match(CLUB, 'u', 'l1', [{ entryId: 'e1', amountCents: 10000 }]);
    expect(reconciled(state.entries[0])).toBe(false);
    await svc.match(CLUB, 'u', 'l2', [{ entryId: 'e1', amountCents: 20000 }]);
    expect(reconciled(state.entries[0])).toBe(true);
    expect(state.statement.status).toBe('RECONCILED');
  });

  it('refuse de dépasser ce qu’il reste à rapprocher sur une écriture', async () => {
    const { svc } = makeWorld(
      [entry('e1', '2026-09-01', 10000, 'DEBIT')],
      [line('l1', '2026-09-03', 6000), line('l2', '2026-09-04', 6000)],
    );
    await svc.match(CLUB, 'u', 'l1', [{ entryId: 'e1', amountCents: 6000 }]);
    await expect(svc.match(CLUB, 'u', 'l2', [{ entryId: 'e1', amountCents: 6000 }])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('détacher : liaisons supprimées, marqueur effacé, relevé de nouveau READY', async () => {
    const { svc, state } = makeWorld(
      [entry('e1', '2026-09-01', 25000, 'DEBIT')],
      [line('l1', '2026-09-03', 25000)],
    );
    await svc.match(CLUB, 'u', 'l1', [{ entryId: 'e1', amountCents: 25000 }]);
    expect(state.statement.status).toBe('RECONCILED');
    await svc.unmatch(CLUB, 'u', 'l1');
    expect(state.matches).toHaveLength(0);
    expect(reconciled(state.entries[0])).toBe(false);
    expect(state.lines[0].status).toBe('UNMATCHED');
    expect(state.statement.status).toBe('READY');
  });

  it('ignorer puis rétablir', async () => {
    const { svc, state } = makeWorld([], [line('l1', '2026-09-03', 100)]);
    await svc.ignore(CLUB, 'u', 'l1', 'NOT_CLUB', 'frais perso');
    expect(state.lines[0]).toMatchObject({ status: 'IGNORED', ignoreReason: 'NOT_CLUB', ignoreNote: 'frais perso' });
    expect(state.statement.status).toBe('RECONCILED');
    await svc.unignore(CLUB, 'l1');
    expect(state.lines[0]).toMatchObject({ status: 'UNMATCHED', ignoreReason: null });
    expect(state.statement.status).toBe('READY');
  });
});
