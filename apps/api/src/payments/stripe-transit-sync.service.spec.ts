import Stripe from 'stripe';
import { StripeTransitSyncService } from './stripe-transit-sync.service';

jest.mock('stripe');

/**
 * Synchronisation du transit Stripe (lot 8).
 *
 * Ce qui est vérifié : un virement manqué est rattrapé sans doublon, une
 * transaction que ClubFlow connaît ne devient JAMAIS une ligne (sinon le
 * trésorier la comptabiliserait deux fois), une transaction inconnue en
 * devient toujours une (sinon le transit dérive en silence), et repasser ne
 * change rien.
 */

const CLUB = 'club-1';
const TRANSIT = 'fa-transit';
const ACCT = 'acct_1';

const payoutsList = jest.fn();
const balanceTransactionsList = jest.fn();
(Stripe as unknown as jest.Mock).mockImplementation(() => ({
  payouts: { list: payoutsList },
  balanceTransactions: { list: balanceTransactionsList },
}));

function stripeTxn(over: Record<string, unknown> = {}) {
  return {
    id: 'txn_1',
    type: 'charge',
    net: 1800,
    description: null,
    created: 1_767_225_600, // 2026-01-01
    source: { id: 'ch_1', payment_intent: 'pi_1' },
    ...over,
  };
}

function payout(over: Record<string, unknown> = {}) {
  return {
    id: 'po_1',
    status: 'paid',
    amount: 1800,
    arrival_date: 1_767_312_000, // 2026-01-02
    ...over,
  };
}

interface WorldOpts {
  stripeAccountId?: string | null;
  accountingStartsOn?: Date | null;
  accountingEnabled?: boolean;
  transit?: boolean;
  /** Écritures de virement déjà présentes, par `stripePayoutId`. */
  recordedPayoutIds?: string[];
  payments?: Array<{
    stripeBalanceTransactionId?: string | null;
    externalRef?: string | null;
    stripeRefundId?: string | null;
  }>;
  previousClosingCents?: number | null;
  transitOpeningCents?: number | null;
  syncedAt?: Date | null;
}

function makeWorld(opts: WorldOpts = {}) {
  const club = {
    id: CLUB,
    stripeAccountId: opts.stripeAccountId === undefined ? ACCT : opts.stripeAccountId,
    accountingStartsOn:
      opts.accountingStartsOn === undefined
        ? new Date('2026-01-01T00:00:00.000Z')
        : opts.accountingStartsOn,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  };
  const transit = {
    id: TRANSIT,
    clubId: CLUB,
    kind: 'STRIPE_TRANSIT',
    stripeSyncedAt: (opts.syncedAt ?? null) as Date | null,
    openingBalanceCents: opts.transitOpeningCents ?? null,
    accountingAccount: { code: '512300' },
  };
  const payments = opts.payments ?? [];
  const recordedPayoutIds = new Set(opts.recordedPayoutIds ?? []);
  const statements: Array<Record<string, unknown>> = [];
  const lines: Array<Record<string, unknown>> = [];
  let seq = 0;

  const prisma = {
    club: {
      findUnique: jest.fn(async () => club),
      findMany: jest.fn(async () => (club.stripeAccountId ? [{ id: CLUB }] : [])),
    },
    clubFinancialAccount: {
      findFirst: jest.fn(async ({ where }: { where: { kind: string } }) =>
        opts.transit === false || where.kind !== 'STRIPE_TRANSIT' ? null : transit,
      ),
      findUniqueOrThrow: jest.fn(async () => transit),
      update: jest.fn(async ({ data }: { data: { stripeSyncedAt: Date } }) => {
        transit.stripeSyncedAt = data.stripeSyncedAt;
        return transit;
      }),
    },
    accountingEntry: {
      count: jest.fn(async ({ where }: { where: { stripePayoutId: string } }) =>
        recordedPayoutIds.has(where.stripePayoutId) ? 1 : 0,
      ),
    },
    payment: {
      // Fidèle : chaque colonne est cherchée séparément, comme le service
      // le fait. Un double qui répondrait à tout laisserait passer un index
      // bâti sur la mauvaise colonne.
      findMany: jest.fn(
        async ({
          where,
          select,
        }: {
          where: Record<string, { in: string[] } | string>;
          select: Record<string, boolean>;
        }) => {
          const field = Object.keys(select)[0] as
            | 'stripeBalanceTransactionId'
            | 'externalRef'
            | 'stripeRefundId';
          const wanted = (where[field] as { in: string[] } | undefined)?.in ?? [];
          return payments
            .filter((p) => {
              const v = p[field];
              return !!v && wanted.includes(v);
            })
            .map((p) => ({ [field]: p[field] }));
        },
      ),
    },
    bankStatement: {
      findFirst: jest.fn(
        async ({ where }: { where: { format: string; periodStart: Date } }) =>
          statements.find(
            (st) =>
              st.format === where.format &&
              (st.periodStart as Date).getTime() === where.periodStart.getTime(),
          ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const st = { ...data, id: `st-${++seq}`, lineCount: 0 };
        statements.push(st);
        return st;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const st = statements.find((x) => x.id === where.id)!;
        return { ...st, lines: lines.filter((l) => l.statementId === st.id) };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => {
        const st = statements.find((x) => x.id === where.id)!;
        Object.assign(st, data);
        return st;
      }),
    },
    bankStatementLine: {
      findMany: jest.fn(async ({ where }: { where: { statementId: string } }) =>
        lines.filter((l) => l.statementId === where.statementId),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const l = { ...data, id: `l-${++seq}` };
        lines.push(l);
        return l;
      }),
    },
  };

  const accounting = {
    isAccountingEnabled: jest.fn(async () => opts.accountingEnabled !== false),
    recordStripePayout: jest.fn(async ({ payoutId }: { payoutId: string }) => {
      recordedPayoutIds.add(payoutId);
    }),
  };
  const integrity = {
    previousStatement: jest.fn(async () =>
      opts.previousClosingCents === undefined || opts.previousClosingCents === null
        ? null
        : { id: 'st-prev', closingBalanceCents: opts.previousClosingCents },
    ),
    recompute: jest.fn(async () => undefined),
    rechainFollowing: jest.fn(async () => undefined),
  };
  const lock = { withLock: jest.fn(async (_k: string, _ms: number, fn: () => Promise<void>) => fn()) };

  const svc = new StripeTransitSyncService(
    prisma as never,
    accounting as never,
    integrity as never,
    lock as never,
  );
  return { svc, prisma, accounting, integrity, lock, statements, lines, transit };
}

function stripeReturns(
  payouts: Array<Record<string, unknown>>,
  txnsByPayout: Record<string, Array<Record<string, unknown>>>,
) {
  payoutsList.mockResolvedValue({ data: payouts, has_more: false });
  balanceTransactionsList.mockImplementation(async ({ payout: id }: { payout: string }) => ({
    data: txnsByPayout[id] ?? [],
    has_more: false,
  }));
}

describe('StripeTransitSyncService.syncClub', () => {
  const OLD_KEY = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });
  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = OLD_KEY;
  });

  it('rattrape le virement dont l’écriture manque', async () => {
    const w = makeWorld();
    stripeReturns([payout()], { po_1: [stripeTxn(), stripeTxn({ id: 'tp', type: 'payout', net: -1800 })] });

    const report = await w.svc.syncClub(CLUB);

    expect(w.accounting.recordStripePayout).toHaveBeenCalledWith({
      clubId: CLUB,
      payoutId: 'po_1',
      amountCents: 1800,
      occurredAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(report.payoutsRecorded).toBe(1);
  });

  it('ne compte pas comme rattrapé un virement déjà écrit', async () => {
    const w = makeWorld({ recordedPayoutIds: ['po_1'] });
    stripeReturns([payout()], { po_1: [stripeTxn()] });

    const report = await w.svc.syncClub(CLUB);

    // L'appel reste fait : `recordStripePayout` est idempotent, c'est lui
    // qui garantit l'absence de doublon, pas un test préalable.
    expect(w.accounting.recordStripePayout).toHaveBeenCalled();
    expect(report.payoutsRecorded).toBe(0);
  });

  it('ignore un virement qui n’est pas payé', async () => {
    const w = makeWorld();
    stripeReturns([payout({ status: 'pending' })], { po_1: [stripeTxn()] });

    const report = await w.svc.syncClub(CLUB);

    expect(w.accounting.recordStripePayout).not.toHaveBeenCalled();
    expect(report.payoutsSeen).toBe(1);
    expect(w.lines).toHaveLength(0);
  });

  it('ne crée aucune ligne pour une transaction que ClubFlow connaît', async () => {
    const w = makeWorld({ payments: [{ stripeBalanceTransactionId: 'txn_1' }] });
    stripeReturns([payout()], { po_1: [stripeTxn(), stripeTxn({ id: 'tp', type: 'payout', net: -1800 })] });

    const report = await w.svc.syncClub(CLUB);

    expect(w.lines).toHaveLength(0);
    expect(report.unknownLines).toBe(0);
  });

  it('fait une ligne à catégoriser de ce que personne ne connaît', async () => {
    const w = makeWorld();
    stripeReturns([payout({ amount: 5000 })], {
      po_1: [
        stripeTxn({ id: 'txn_inconnu', net: 5000, description: 'Paiement au comptoir', source: { id: 'ch_9' } }),
        stripeTxn({ id: 'tp', type: 'payout', net: -5000 }),
      ],
    });

    const report = await w.svc.syncClub(CLUB);

    expect(report.unknownLines).toBe(1);
    expect(w.lines).toHaveLength(1);
    expect(w.lines[0]).toMatchObject({
      clubId: CLUB,
      financialAccountId: TRANSIT,
      label: 'Paiement au comptoir',
      amountCents: 5000,
      fitId: 'txn_inconnu',
      reference: 'ch_9',
      status: 'UNMATCHED',
    });
  });

  it('repasser sur le même virement n’ajoute aucune ligne', async () => {
    const w = makeWorld();
    stripeReturns([payout({ amount: 5000 })], {
      po_1: [stripeTxn({ id: 'txn_inconnu', net: 5000 }), stripeTxn({ id: 'tp', type: 'payout', net: -5000 })],
    });

    await w.svc.syncClub(CLUB);
    const second = await w.svc.syncClub(CLUB);

    expect(w.lines).toHaveLength(1);
    expect(second.unknownLines).toBe(0);
  });

  it('le relevé synthétisé chaîne sur le solde de fin du précédent', async () => {
    const w = makeWorld({ previousClosingCents: 12_000 });
    stripeReturns([payout({ amount: 5000 })], {
      po_1: [stripeTxn({ id: 'txn_inconnu', net: 5000 }), stripeTxn({ id: 'tp', type: 'payout', net: -5000 })],
    });

    await w.svc.syncClub(CLUB);

    expect(w.statements[0]).toMatchObject({
      format: 'STRIPE_API',
      financialAccountId: TRANSIT,
      openingBalanceCents: 12_000,
      // Solde de fin = début + lignes, recalculé après insertion.
      closingBalanceCents: 17_000,
      lineCount: 1,
    });
  });

  it('à défaut de relevé précédent, part du solde d’ouverture du transit', async () => {
    const w = makeWorld({ transitOpeningCents: 3_000 });
    stripeReturns([payout({ amount: 5000 })], {
      po_1: [stripeTxn({ id: 'txn_inconnu', net: 5000 }), stripeTxn({ id: 'tp', type: 'payout', net: -5000 })],
    });

    await w.svc.syncClub(CLUB);

    expect(w.statements[0]).toMatchObject({ openingBalanceCents: 3_000, closingBalanceCents: 8_000 });
  });

  it('range les inconnues par mois, un relevé chacun', async () => {
    const w = makeWorld();
    stripeReturns([payout({ amount: 3000 })], {
      po_1: [
        stripeTxn({ id: 'txn_jan', net: 1000, created: 1_767_225_600 }), // 2026-01-01
        stripeTxn({ id: 'txn_fev', net: 2000, created: 1_769_904_000 }), // 2026-02-01
        stripeTxn({ id: 'tp', type: 'payout', net: -3000 }),
      ],
    });

    await w.svc.syncClub(CLUB);

    expect(w.statements).toHaveLength(2);
    const periods = w.statements.map((st) => (st.periodStart as Date).toISOString().slice(0, 10));
    expect(periods.sort()).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('signale l’écart d’arithmétique du virement sans s’arrêter', async () => {
    const w = makeWorld({ payments: [{ stripeBalanceTransactionId: 'txn_1' }] });
    // 1 800 c de transactions pour 5 000 c versés : il manque une page.
    stripeReturns([payout({ amount: 5000 })], { po_1: [stripeTxn(), stripeTxn({ id: 'tp', type: 'payout', net: -5000 })] });

    const report = await w.svc.syncClub(CLUB);

    expect(report.arithmeticWarnings).toBe(1);
    expect(report.payoutsSeen).toBe(1);
  });

  it('relit deux jours en arrière : un virement manqué serait invisible', async () => {
    const w = makeWorld({ syncedAt: new Date('2026-06-10T04:30:00.000Z') });
    stripeReturns([], {});

    await w.svc.syncClub(CLUB);

    const args = payoutsList.mock.calls[0][0] as { arrival_date: { gte: number } };
    expect(new Date(args.arrival_date.gte * 1000).toISOString()).toBe('2026-06-08T04:30:00.000Z');
  });

  it('ne remonte jamais avant la date de reprise comptable', async () => {
    // Deux jours avant la première synchro tomberaient avant la reprise :
    // on écrirait des mouvements que la comptabilité du club ignore.
    const w = makeWorld({ syncedAt: new Date('2026-01-01T12:00:00.000Z') });
    stripeReturns([], {});

    await w.svc.syncClub(CLUB);

    const args = payoutsList.mock.calls[0][0] as { arrival_date: { gte: number } };
    expect(new Date(args.arrival_date.gte * 1000).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('part de la date de reprise quand rien n’a jamais été synchronisé', async () => {
    const w = makeWorld();
    stripeReturns([], {});

    await w.svc.syncClub(CLUB);

    const args = payoutsList.mock.calls[0][0] as { arrival_date: { gte: number } };
    expect(new Date(args.arrival_date.gte * 1000).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('avance le marqueur de synchro à la fin', async () => {
    const w = makeWorld();
    stripeReturns([], {});

    await w.svc.syncClub(CLUB);

    expect(w.prisma.clubFinancialAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeSyncedAt: expect.any(Date) } }),
    );
  });

  it.each([
    ['sans compte Stripe', { stripeAccountId: null }],
    ['module comptabilité inactif', { accountingEnabled: false }],
    ['date de reprise non renseignée', { accountingStartsOn: null }],
    ['sans compte de transit', { transit: false }],
  ])('ne touche pas à Stripe quand le club est %s', async (raison, opts) => {
    const w = makeWorld(opts as WorldOpts);
    stripeReturns([payout()], { po_1: [stripeTxn()] });

    const report = await w.svc.syncClub(CLUB);

    expect(report.skipped).toBe(raison);
    expect(payoutsList).not.toHaveBeenCalled();
    expect(w.prisma.clubFinancialAccount.update).not.toHaveBeenCalled();
  });

  it('renonce sans clé Stripe, plutôt que de lever', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const w = makeWorld();

    const report = await w.svc.syncClub(CLUB);

    expect(report.skipped).toBe('STRIPE_SECRET_KEY absente');
  });

  it('un club en échec ne fait pas tomber la synchro', async () => {
    const w = makeWorld();
    payoutsList.mockRejectedValue(new Error('Stripe indisponible'));

    const report = await w.svc.syncClub(CLUB);

    expect(report.skipped).toBe('erreur');
    expect(report.payoutsSeen).toBe(0);
  });
});

describe('StripeTransitSyncService.dailySync', () => {
  const OLD_KEY = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    delete process.env.STRIPE_TRANSIT_SYNC_DISABLED;
  });
  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = OLD_KEY;
  });

  it('prend le verrou avant de balayer', async () => {
    const w = makeWorld();
    stripeReturns([], {});

    await w.svc.dailySync();

    expect(w.lock.withLock).toHaveBeenCalledWith(
      'stripe-transit-sync',
      expect.any(Number),
      expect.any(Function),
    );
    expect(w.prisma.club.findMany).toHaveBeenCalled();
  });

  it('l’interrupteur d’urgence coupe le balayage sans prendre le verrou', async () => {
    process.env.STRIPE_TRANSIT_SYNC_DISABLED = 'true';
    const w = makeWorld();

    await w.svc.dailySync();

    expect(w.lock.withLock).not.toHaveBeenCalled();
    expect(w.prisma.club.findMany).not.toHaveBeenCalled();
  });
});
