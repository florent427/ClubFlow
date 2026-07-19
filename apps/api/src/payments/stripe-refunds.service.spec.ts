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
const retrieve = jest.fn();
(Stripe as unknown as jest.Mock).mockImplementation(() => ({
  refunds: { create },
  paymentIntents: { retrieve },
}));

/** PaymentIntent enrichi annonçant un montant déjà remboursé chez Stripe. */
const piRefunded = (amountRefunded: number) => ({
  latest_charge: { amount_refunded: amountRefunded },
});

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
    // Par défaut Stripe ne connaît aucun remboursement sur cet encaissement.
    retrieve.mockResolvedValue(piRefunded(0));
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
    const { svc } = makeSvc();
    retrieve.mockResolvedValue(piRefunded(3_000));

    const res = await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      reason: 'Annulation',
    });

    expect(res.amountCents).toBe(7_000);
  });

  it('refuse de rendre plus que ce qui a été perçu', async () => {
    const { svc } = makeSvc();
    retrieve.mockResolvedValue(piRefunded(8_000));

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
    const { svc } = makeSvc();
    retrieve.mockResolvedValue(piRefunded(10_000));

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

  it('lit le déjà-remboursé CHEZ STRIPE, pas dans la base', async () => {
    // Notre base ne l'apprend qu'au retour du webhook. Deux gestes rapprochés
    // dans cette fenêtre produiraient la même clé d'idempotence, et Stripe
    // renverrait le premier remboursement au lieu d'en créer un second : le
    // trésorier croirait avoir rendu 80 €, l'adhérent n'en aurait reçu que 40.
    const { svc } = makeSvc({ alreadyRefundedCents: 0 });
    retrieve.mockResolvedValue(piRefunded(4_000));

    const res = await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      reason: 'Annulation',
    });

    // 100 € encaissés, 40 € déjà rendus selon Stripe → 60 € remboursables,
    // alors que la base en annonce encore 100.
    expect(res.amountCents).toBe(6_000);
  });

  it('la clé d’idempotence suit le montant connu de Stripe', async () => {
    const { svc } = makeSvc({ alreadyRefundedCents: 0 });
    retrieve.mockResolvedValue(piRefunded(4_000));

    await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: 1_000,
      reason: 'x',
    });

    // Deux remboursements successifs de 10 € ne partagent plus la même clé
    // dès lors que Stripe a enregistré le premier.
    expect(create.mock.calls[0][1].idempotencyKey).toContain('4000');
  });

  it('refuse de dépasser ce que Stripe dit remboursable', async () => {
    const { svc } = makeSvc({ alreadyRefundedCents: 0 });
    retrieve.mockResolvedValue(piRefunded(9_000));

    await expect(
      svc.refundPayment({
        clubId: 'club-1',
        paymentId: 'pay-1',
        amountCents: 5_000,
        reason: 'x',
      }),
    ).rejects.toThrow(/1000/);
  });

  it('PaymentIntent sans charge : ce n’est PAS une panne, le remboursement reste possible', async () => {
    // Le pendant indispensable du test suivant. Refuser dès que Stripe ne
    // renvoie pas de charge confondrait « rien n'a été remboursé » — un fait —
    // avec « je n'ai pas pu lire » — une panne. Le premier cas doit laisser
    // passer : c'est Stripe qui refusera plus loin si l'encaissement n'est
    // pas remboursable, avec un message clair.
    const { svc } = makeSvc({ alreadyRefundedCents: 0 });
    retrieve.mockResolvedValue({ latest_charge: null });
    create.mockResolvedValue({ id: 're_ok' });

    const res = await svc.refundPayment({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: 2_000,
      reason: 'x',
    });

    expect(res.amountCents).toBe(2_000);
    // Déjà remboursé = 0, et la clé d'idempotence le reflète.
    expect(create.mock.calls[0][1].idempotencyKey).toContain('-0-2000');
  });

  it('Stripe illisible : REFUSE le remboursement au lieu de se replier sur la base', async () => {
    // Ce test asseyait auparavant le contraire — « repli sur la base, jamais
    // de blocage » — au motif qu'une lecture en échec est accessoire. Elle ne
    // l'est pas : elle fournit le plafond ET la clé d'idempotence.
    //
    // Le danger n'est pas le dépassement, que Stripe refuse de toute façon,
    // mais la clé. Calculée sur une base en retard, elle rejoue celle du
    // remboursement précédent : Stripe renvoie alors le PREMIER remboursement,
    // l'appel réussit, le trésorier croit avoir rendu 40 € deux fois et
    // l'adhérent n'en reçoit qu'un.
    const { svc } = makeSvc({ alreadyRefundedCents: 3_000 });
    retrieve.mockRejectedValue(new Error('Stripe down'));

    await expect(
      svc.refundPayment({
        clubId: 'club-1',
        paymentId: 'pay-1',
        reason: 'Annulation',
      }),
    ).rejects.toThrow(/indisponible chez Stripe/);

    // L'assertion qui mord vraiment : aucun euro n'a bougé.
    expect(create).not.toHaveBeenCalled();
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

  it('facture PARTIELLEMENT réglée : l’avoir éteint la créance remboursée (ADR-0011)', async () => {
    // Le test précédent porte sur une facture INTÉGRALEMENT réglée, où
    // l'invariant est vrai par construction : il ne prouve donc rien sur le
    // cas où l'on peut se tromper. Celui-ci couvre ce cas.
    //
    // Échéancier de 300 €, première échéance de 100 € prélevée puis
    // remboursée. Deux lectures s'affrontent :
    //   — ressusciter la dette : solde 300 €, l'avoir vaudrait 0 ;
    //   — l'éteindre : solde 200 €, l'avoir vaut les 100 € rendus.
    // C'est la seconde qui est retenue (ADR-0011). Rendre l'argent éteint la
    // dette correspondante ; l'adhérent paiera 200 € au total.
    const { svc, created } = makeSvc({
      payment: {
        ...STRIPE_PAYMENT,
        amountCents: 10_000,
        invoice: {
          id: 'inv-1',
          label: 'Adhésion (échéancier)',
          status: 'OPEN',
          isCreditNote: false,
        },
      },
    });

    await svc.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_1',
      amountCents: 10_000,
      stripeAccountId: 'acct_1',
    });

    const note = created.find((c) => c.model === 'invoice')?.data as {
      amountCents: number;
    };

    // L'avoir vaut le montant rendu, quel que soit le reste dû.
    expect(note.amountCents).toBe(10_000);

    // Facture 300 €, encaissé net 0 (100 € prélevés puis rendus), avoir 100 €
    // → il reste 200 € à percevoir, et non 300 €.
    const { balanceCents } = invoicePaymentTotals(30_000, 0, note.amountCents);
    expect(balanceCents).toBe(20_000);
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
