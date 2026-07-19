import Stripe from 'stripe';
import { StripeFeesService } from './stripe-fees.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccountingService } from '../accounting/accounting.service';
import type { SchedulerLockService } from '../scheduling/scheduler-lock.service';

jest.mock('stripe');

/**
 * Partie à EFFETS DE BORD du service de frais.
 *
 * `extractStripeFee` est couverte à part (stripe-fees.spec.ts). Ici on vérifie
 * ce qui touche la base, la comptabilité et l'API Stripe — et surtout les
 * invariants revendiqués dans les commentaires du service, qui n'engagent
 * personne tant qu'aucun test ne les tient.
 */

const retrieve = jest.fn();
(Stripe as unknown as jest.Mock).mockImplementation(() => ({
  paymentIntents: { retrieve },
}));

const PI_WITH_FEE = {
  latest_charge: {
    balance_transaction: {
      id: 'txn_1',
      currency: 'eur',
      fee_details: [{ type: 'stripe_fee', amount: 175 }],
    },
  },
};
/** Charge non dénouée : cas nominal d'un prélèvement SEPA. */
const PI_PENDING = { latest_charge: { balance_transaction: null } };

function makeSvc(payment: Record<string, unknown> | null) {
  const prisma = {
    payment: {
      findUnique: jest.fn().mockResolvedValue(payment),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const accounting = {
    recordStripeFeesFromPayment: jest.fn().mockResolvedValue(undefined),
  };
  const lock = { withLock: jest.fn() };

  const svc = new StripeFeesService(
    prisma as unknown as PrismaService,
    accounting as unknown as AccountingService,
    lock as unknown as SchedulerLockService,
  );
  return { svc, prisma, accounting, lock };
}

const STRIPE_PAYMENT = {
  id: 'pay-1',
  clubId: 'club-1',
  externalRef: 'pi_123',
  stripeAccountId: 'acct_1',
  stripeFeesSyncedAt: null,
};

describe('StripeFeesService.syncFeesForPayment', () => {
  const OLD_ENV = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });
  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = OLD_ENV;
  });

  it('persiste les frais puis les comptabilise, dans cet ordre', async () => {
    // L'ordre compte : si l'écriture comptable échoue, la donnée doit déjà
    // être acquise sur le Payment.
    const { svc, prisma, accounting } = makeSvc(STRIPE_PAYMENT);
    retrieve.mockResolvedValue(PI_WITH_FEE);

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(true);

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeFeeCents: 175,
          stripeFeeCurrency: 'eur',
          stripeBalanceTransactionId: 'txn_1',
        }),
      }),
    );
    expect(accounting.recordStripeFeesFromPayment).toHaveBeenCalledWith(
      'club-1',
      'pay-1',
      175,
    );
  });

  it('interroge Stripe SUR LE COMPTE CONNECTÉ, pas sur la plateforme', async () => {
    // En direct charges (ADR-0008), la balance transaction vit sur acct_xxx :
    // sans cette option, Stripe répondrait « introuvable ».
    const { svc } = makeSvc(STRIPE_PAYMENT);
    retrieve.mockResolvedValue(PI_WITH_FEE);

    await svc.syncFeesForPayment('pay-1');

    expect(retrieve).toHaveBeenCalledWith(
      'pi_123',
      expect.objectContaining({
        expand: ['latest_charge.balance_transaction'],
      }),
      { stripeAccount: 'acct_1' },
    );
  });

  it('charge non dénouée : rien n’est écrit et on repassera plus tard', async () => {
    const { svc, prisma, accounting } = makeSvc(STRIPE_PAYMENT);
    retrieve.mockResolvedValue(PI_PENDING);

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(false);

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(accounting.recordStripeFeesFromPayment).not.toHaveBeenCalled();
  });

  it('n’interroge pas Stripe deux fois pour les mêmes frais', async () => {
    const { svc } = makeSvc({
      ...STRIPE_PAYMENT,
      stripeFeesSyncedAt: new Date(),
    });

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(true);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('ignore un encaissement manuel : il n’a pas de frais à chercher', async () => {
    const { svc } = makeSvc({
      ...STRIPE_PAYMENT,
      stripeAccountId: null,
      externalRef: 'CHQ-42',
    });

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(false);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('une panne Stripe est avalée, jamais propagée', async () => {
    // Principe cardinal : un encaissement acquis ne doit pas être remis en
    // cause parce que Stripe est indisponible.
    const { svc } = makeSvc(STRIPE_PAYMENT);
    retrieve.mockRejectedValue(new Error('Stripe down'));

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(false);
  });

  it('un échec d’écriture comptable ne perd pas la donnée acquise', async () => {
    // Plan comptable incomplet : les frais restent sur le Payment, le club
    // les retrouvera en activant sa comptabilité.
    const { svc, prisma, accounting } = makeSvc(STRIPE_PAYMENT);
    retrieve.mockResolvedValue(PI_WITH_FEE);
    accounting.recordStripeFeesFromPayment.mockRejectedValue(
      new Error('Compte 627000 introuvable'),
    );

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(true);
    expect(prisma.payment.update).toHaveBeenCalled();
  });

  it('sans clé Stripe, n’échoue pas — se contente de ne rien faire', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { svc, prisma } = makeSvc(STRIPE_PAYMENT);

    await expect(svc.syncFeesForPayment('pay-1')).resolves.toBe(false);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('paiement introuvable : pas d’exception', async () => {
    const { svc } = makeSvc(null);

    await expect(svc.syncFeesForPayment('nope')).resolves.toBe(false);
  });
});

describe('StripeFeesService.sweepPendingFees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  });

  it('ne reprend que les encaissements ni trop récents ni trop anciens', async () => {
    const { svc, prisma } = makeSvc(null);
    const now = new Date('2026-07-18T12:00:00Z');

    await svc.sweepPendingFees({ now });

    const where = prisma.payment.findMany.mock.calls[0][0].where;
    // Trop récent : le webhook vient à peine de passer, inutile d'insister.
    expect(where.createdAt.lt).toEqual(new Date('2026-07-18T11:50:00Z'));
    // Trop ancien : l'échec n'est plus une question de latence bancaire.
    expect(where.createdAt.gte).toEqual(new Date('2026-06-18T12:00:00Z'));
    expect(where.stripeFeesSyncedAt).toBeNull();
    expect(where.stripeAccountId).toEqual({ not: null });
  });

  it('compte les encaissements abandonnés plutôt que de les taire', async () => {
    // Sans ce décompte, des frais définitivement perdus disparaîtraient en
    // silence et le résultat du club resterait faux sans que rien ne le dise.
    const { svc, prisma } = makeSvc(null);
    prisma.payment.count.mockResolvedValue(3);

    const report = await svc.sweepPendingFees({
      now: new Date('2026-07-18T12:00:00Z'),
    });

    expect(report.abandoned).toBe(3);
  });

  it('rend un décompte exact de ce qui a été résolu', async () => {
    const { svc, prisma } = makeSvc(null);
    prisma.payment.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    // p1 aboutit, p2 est encore en attente de dénouement.
    prisma.payment.findUnique
      .mockResolvedValueOnce({ ...STRIPE_PAYMENT, id: 'p1' })
      .mockResolvedValueOnce({ ...STRIPE_PAYMENT, id: 'p2' });
    retrieve
      .mockResolvedValueOnce(PI_WITH_FEE)
      .mockResolvedValueOnce(PI_PENDING);

    const report = await svc.sweepPendingFees({
      now: new Date('2026-07-18T12:00:00Z'),
    });

    expect(report.examined).toBe(2);
    expect(report.resolved).toBe(1);
  });
});
