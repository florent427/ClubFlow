import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClubPaymentMethod } from '@prisma/client';
import Stripe from 'stripe';
import { StripeRefundsService } from './stripe-refunds.service';
import { invoicePaymentTotals } from './invoice-totals';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreditNotesService } from './credit-notes.service';
import type { SchedulerLockService } from '../scheduling/scheduler-lock.service';

jest.mock('stripe');

const create = jest.fn();
(Stripe as unknown as jest.Mock).mockImplementation(() => ({
  refunds: { create },
}));

const STRIPE_PAYMENT = {
  id: 'pay-1',
  clubId: 'club-1',
  invoiceId: 'inv-1',
  amountCents: 10_000,
  method: ClubPaymentMethod.STRIPE_CARD,
  externalRef: 'pi_123',
  stripeAccountId: 'acct_1',
  paidByMemberId: 'm-1',
  paidByContactId: null,
  invoice: { id: 'inv-1', label: 'Cotisation', status: 'PAID', isCreditNote: false },
};

function makeSvc(opts?: {
  payment?: Record<string, unknown> | null;
  alreadyRefundedCents?: number;
  existingRefund?: boolean;
}) {
  const created: Array<{ model: string; data: Record<string, unknown> }> = [];

  const tx = {
    payment: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push({ model: 'payment', data });
        return data;
      }),
    },
    invoice: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push({ model: 'invoice', data });
        return data;
      }),
    },
  };

  const payment = opts?.payment === undefined ? STRIPE_PAYMENT : opts.payment;

  const prisma = {
    payment: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        // Recherche d'un remboursement déjà enregistré (idempotence).
        if (typeof where.stripeRefundId === 'string') {
          return opts?.existingRefund ? { id: 'deja' } : null;
        }
        return payment;
      }),
      findUnique: jest.fn().mockResolvedValue(
        payment ? { invoiceId: 'inv-1', externalRef: 'pi_123' } : null,
      ),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountCents: -(opts?.alreadyRefundedCents ?? 0) },
      }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  // Double de CreditNotesService : enregistre l'avoir dans la même liste que
  // les autres écritures, pour que les assertions restent lisibles.
  const creditNotes = {
    create: jest.fn(async (a: { amountCents: number; parentInvoiceId: string }) => {
      const data = {
        isCreditNote: true,
        amountCents: a.amountCents,
        parentInvoiceId: a.parentInvoiceId,
      };
      created.push({ model: 'invoice', data });
      return { id: 'cn-1', ...data };
    }),
    recordAccounting: jest.fn().mockResolvedValue(undefined),
  };

  const svc = new StripeRefundsService(
    prisma as unknown as PrismaService,
    creditNotes as unknown as CreditNotesService,
    { withLock: jest.fn() } as unknown as SchedulerLockService,
  );
  return { svc, prisma, created, tx, creditNotes };
}

describe('StripeRefundsService.refundPayment', () => {
  const OLD = process.env.STRIPE_SECRET_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    create.mockResolvedValue({ id: 're_1' });
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = OLD;
  });

  it('rembourse SUR LE COMPTE CONNECTÉ, jamais depuis la plateforme', async () => {
    // En direct charges l'argent est chez le club : rembourser depuis la
    // plateforme prélèverait ClubFlow pour une dette qui n'est pas la sienne.
    const { svc } = makeSvc();

    await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: 4_000,
      reason: 'Annulation inscription',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_123', amount: 4_000 }),
      expect.objectContaining({ stripeAccount: 'acct_1' }),
    );
  });

  it('porte une clé d’idempotence : un double-clic ne rend l’argent qu’une fois', async () => {
    const { svc } = makeSvc();

    await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: 4_000,
      reason: 'Annulation',
    });

    const opts = create.mock.calls[0][1];
    expect(typeof opts.idempotencyKey).toBe('string');
    expect(opts.idempotencyKey).toContain('pay-1');
  });

  it('rembourse tout le solde restant quand aucun montant n’est donné', async () => {
    const { svc } = makeSvc({ alreadyRefundedCents: 3_000 });

    const res = await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      reason: 'Annulation',
    });

    expect(res.amountCents).toBe(7_000);
  });

  it('refuse de rendre plus que ce qui a été perçu', async () => {
    const { svc } = makeSvc({ alreadyRefundedCents: 8_000 });

    await expect(
      svc.refundPayment({
        clubId: 'club-1',
        paymentId: 'pay-1',
        amountCents: 5_000,
        reason: 'Annulation',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse un encaissement déjà intégralement remboursé', async () => {
    const { svc } = makeSvc({ alreadyRefundedCents: 10_000 });

    await expect(
      svc.refundPayment({ clubId: 'club-1', paymentId: 'pay-1', reason: 'x' }),
    ).rejects.toThrow(/intégralement remboursé/);
  });

  it('refuse de rembourser un remboursement', async () => {
    const { svc } = makeSvc({
      payment: { ...STRIPE_PAYMENT, amountCents: -4_000 },
    });

    await expect(
      svc.refundPayment({ clubId: 'club-1', paymentId: 'pay-1', reason: 'x' }),
    ).rejects.toThrow(/déjà un remboursement/);
  });

  it('oriente vers l’avoir manuel pour un encaissement non-Stripe', async () => {
    // Un chèque ne se rembourse pas par API : le message doit dire quoi faire
    // plutôt que de se contenter de refuser.
    const { svc } = makeSvc({
      payment: { ...STRIPE_PAYMENT, method: ClubPaymentMethod.MANUAL_CHECK },
    });

    await expect(
      svc.refundPayment({ clubId: 'club-1', paymentId: 'pay-1', reason: 'x' }),
    ).rejects.toThrow(/avoir/);
  });

  it('exige un motif', async () => {
    const { svc } = makeSvc();

    await expect(
      svc.refundPayment({ clubId: 'club-1', paymentId: 'pay-1', reason: '   ' }),
    ).rejects.toThrow(/Motif/);
  });

  it('refuse un encaissement inconnu', async () => {
    const { svc } = makeSvc({ payment: null });

    await expect(
      svc.refundPayment({ clubId: 'club-1', paymentId: 'nope', reason: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('StripeRefundsService.applyRefundConfirmed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crée un Payment négatif ET un avoir du même montant', async () => {
    const { svc, created } = makeSvc();

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_1',
      amountCents: 4_000,
      stripeAccountId: 'acct_1',
    });

    const pay = created.find((c) => c.model === 'payment')?.data;
    const note = created.find((c) => c.model === 'invoice')?.data;

    expect(pay?.amountCents).toBe(-4_000);
    expect(pay?.externalRef).toBe('re_1');
    expect(note?.isCreditNote).toBe(true);
    expect(note?.amountCents).toBe(4_000);
    expect(note?.parentInvoiceId).toBe('inv-1');
  });

  it('LE SOLDE NE ROUVRE PAS : c’est ce qui empêche un second débit', async () => {
    // Sans l'avoir, le Payment négatif ferait remonter le solde de la facture,
    // `isCollectable` redeviendrait vrai, et le moteur reprélèverait
    // l'adhérent qu'on vient de rembourser. On vérifie ici l'arithmétique
    // exacte que consulte le moteur.
    const { svc, created } = makeSvc();

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_1',
      amountCents: 4_000,
      stripeAccountId: 'acct_1',
    });

    const note = created.find((c) => c.model === 'invoice')?.data as {
      amountCents: number;
    };

    // Facture 100 €, encaissé 100 € puis rendu 40 € → payé net 60 €,
    // avoir 40 € : le solde reste nul, rien n'est réclamé à nouveau.
    const { balanceCents } = invoicePaymentTotals(
      10_000,
      10_000 - 4_000,
      note.amountCents,
    );
    expect(balanceCents).toBe(0);
  });

  it('un webhook rejoué n’enregistre pas deux fois le remboursement', async () => {
    const { svc, tx, creditNotes } = makeSvc({ existingRefund: true });

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_1',
      amountCents: 4_000,
      stripeAccountId: 'acct_1',
    });

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(creditNotes.create).not.toHaveBeenCalled();
  });

  it('ignore un remboursement venu d’un AUTRE compte connecté', async () => {
    // Garde-fou multi-tenant : sans lui, un compte tiers pourrait faire
    // écrire un avoir sur la facture d'un autre club.
    const { svc, tx } = makeSvc();

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_1',
      amountCents: 4_000,
      stripeAccountId: 'acct_INTRUS',
    });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('n’écrit rien si l’encaissement d’origine est inconnu', async () => {
    const { svc, tx } = makeSvc({ payment: null });

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_inconnu',
      refundId: 're_1',
      amountCents: 4_000,
      stripeAccountId: 'acct_1',
    });

    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('écrit les deux lignes dans la MÊME transaction', async () => {
    // Un Payment négatif sans son avoir laisserait la facture due : les deux
    // écritures doivent vivre ou mourir ensemble.
    const { svc, prisma } = makeSvc();

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_1',
      amountCents: 4_000,
      stripeAccountId: 'acct_1',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
