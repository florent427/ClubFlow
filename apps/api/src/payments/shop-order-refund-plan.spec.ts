import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
} from '@prisma/client';
import {
  planShopOrderCancellation,
  ShopOrderRefundKind,
  type ShopOrderPlanInput,
  type ShopOrderPlanPayment,
} from './shop-order-refund-plan';

/**
 * Le plan d'annulation (ADR-0019) : ce que l'admin voit avant de confirmer, et
 * ce que le service exécute. Fonction pure — chaque cas se lit en entrée/sortie.
 */

type Line = ShopOrderPlanInput['order']['lines'][number];
type Invoice = NonNullable<ShopOrderPlanInput['invoice']>;

const LINE = (over: Partial<Line> = {}): Line => ({
  id: 'l-1',
  label: 'T-shirt — L',
  quantity: 2,
  awaitingStockQty: 0,
  variantId: 'v-1',
  ...over,
});

const PAY = (over: Partial<ShopOrderPlanPayment> = {}): ShopOrderPlanPayment => ({
  id: 'p-1',
  amountCents: 4000,
  method: ClubPaymentMethod.MANUAL_CASH,
  externalRef: null,
  refundedPaymentId: null,
  cheque: null,
  ...over,
});

function plan(
  over: {
    order?: Partial<ShopOrderPlanInput['order']>;
    invoice?: Partial<Invoice> | null;
    inFlightCents?: number;
  } = {},
) {
  return planShopOrderCancellation({
    order: {
      status: ShopOrderStatus.PAID,
      fulfilledAt: new Date('2026-09-01'),
      deliveredAt: null,
      lines: [LINE()],
      ...over.order,
    },
    invoice:
      over.invoice === null
        ? null
        : {
            status: InvoiceStatus.PAID,
            amountCents: 4000,
            creditNotesCents: 0,
            payments: [PAY()],
            ...over.invoice,
          },
    inFlightCents: over.inFlightCents ?? 0,
  });
}

describe('planShopOrderCancellation — chaque encaissement par son moyen', () => {
  it('espèces : rend le montant encaissé, rien à éteindre', () => {
    const p = plan();

    expect(p.blockers).toEqual([]);
    expect(p.refunds).toEqual([
      {
        kind: ShopOrderRefundKind.CASH,
        paymentId: 'p-1',
        amountCents: 4000,
        chequeId: null,
        chequeNumber: null,
        bankAccountId: null,
      },
    ]);
    expect(p.writeOffCents).toBe(0);
    expect(p.voidInvoice).toBe(false);
  });

  it('virement : rendu par virement', () => {
    const p = plan({
      invoice: { payments: [PAY({ method: ClubPaymentMethod.MANUAL_TRANSFER })] },
    });

    expect(p.refunds.map((r) => r.kind)).toEqual([ShopOrderRefundKind.TRANSFER]);
  });

  it('carte : remboursée par Stripe quand la référence est exploitable', () => {
    const p = plan({
      invoice: {
        payments: [
          PAY({ method: ClubPaymentMethod.STRIPE_CARD, externalRef: 'pi_123' }),
        ],
      },
    });

    expect(p.blockers).toEqual([]);
    expect(p.refunds.map((r) => r.kind)).toEqual([ShopOrderRefundKind.CARD]);
  });

  it('carte sans référence Stripe : refus, et aucune action', () => {
    const p = plan({
      invoice: {
        payments: [
          PAY({ method: ClubPaymentMethod.STRIPE_CARD, externalRef: 'cs_123' }),
        ],
      },
    });

    expect(p.blockers).toEqual([expect.stringMatching(/référence Stripe/)]);
    expect(p.refunds).toEqual([]);
  });

  it('chèque en portefeuille : rendu à l’adhérent', () => {
    const p = plan({
      invoice: {
        payments: [
          PAY({
            method: ClubPaymentMethod.MANUAL_CHECK,
            cheque: {
              id: 'chq-1',
              number: '0012',
              status: ChequeStatus.PENDING,
              depositId: null,
              depositAccountId: null,
            },
          }),
        ],
      },
    });

    expect(p.refunds).toEqual([
      expect.objectContaining({
        kind: ShopOrderRefundKind.CHEQUE_RETURN,
        chequeId: 'chq-1',
        chequeNumber: '0012',
        bankAccountId: null,
      }),
    ]);
  });

  it('chèque déjà remis : remboursé depuis la banque de sa remise', () => {
    const p = plan({
      invoice: {
        payments: [
          PAY({
            method: ClubPaymentMethod.MANUAL_CHECK,
            cheque: {
              id: 'chq-1',
              number: '0012',
              status: ChequeStatus.DEPOSITED,
              depositId: 'dep-1',
              depositAccountId: 'fa-banque',
            },
          }),
        ],
      },
    });

    expect(p.refunds).toEqual([
      expect.objectContaining({
        kind: ShopOrderRefundKind.CHEQUE_DEPOSITED,
        chequeId: 'chq-1',
        bankAccountId: 'fa-banque',
      }),
    ]);
  });

  it.each([
    ['impayé', ChequeStatus.BOUNCED, null, null],
    ['impayé après sa remise', ChequeStatus.BOUNCED, 'dep-1', 'fa-banque'],
    ['annulé', ChequeStatus.CANCELLED, null, null],
    ['en portefeuille mais déjà pris dans une remise', ChequeStatus.PENDING, 'dep-1', null],
  ])('chèque %s : refus', (_cas, status, depositId, depositAccountId) => {
    const p = plan({
      invoice: {
        payments: [
          PAY({
            method: ClubPaymentMethod.MANUAL_CHECK,
            cheque: {
              id: 'chq-1',
              number: '0012',
              status,
              depositId,
              depositAccountId,
            },
          }),
        ],
      },
    });

    expect(p.blockers).toEqual([expect.stringMatching(/chèque n° 0012/)]);
    expect(p.refunds).toEqual([]);
  });

  it('chèque saisi avant le portefeuille : remboursé par virement', () => {
    const p = plan({
      invoice: { payments: [PAY({ method: ClubPaymentMethod.MANUAL_CHECK })] },
    });

    expect(p.refunds.map((r) => r.kind)).toEqual([ShopOrderRefundKind.TRANSFER]);
  });

  it('plusieurs encaissements : une action par encaissement, dans l’ordre', () => {
    const p = plan({
      invoice: {
        payments: [
          PAY({ id: 'p-cash', amountCents: 1000 }),
          PAY({
            id: 'p-card',
            amountCents: 3000,
            method: ClubPaymentMethod.STRIPE_CARD,
            externalRef: 'pi_1',
          }),
        ],
      },
    });

    expect(p.refunds.map((r) => [r.paymentId, r.kind, r.amountCents])).toEqual([
      ['p-cash', ShopOrderRefundKind.CASH, 1000],
      ['p-card', ShopOrderRefundKind.CARD, 3000],
    ]);
    expect(p.writeOffCents).toBe(0);
  });
});

describe('planShopOrderCancellation — ce qui a déjà été rendu', () => {
  it('ne rend que ce qui n’a pas déjà été remboursé', () => {
    const p = plan({
      invoice: {
        creditNotesCents: 1000,
        payments: [
          PAY({
            method: ClubPaymentMethod.STRIPE_CARD,
            externalRef: 'pi_1',
          }),
          PAY({ id: 'p-refund', amountCents: -1000, refundedPaymentId: 'p-1' }),
        ],
      },
    });

    expect(p.refunds.map((r) => r.amountCents)).toEqual([3000]);
    expect(p.writeOffCents).toBe(0);
  });

  it('encaissement entièrement remboursé : rien à rendre ni à éteindre', () => {
    const p = plan({
      invoice: {
        creditNotesCents: 4000,
        payments: [
          PAY(),
          PAY({ id: 'p-refund', amountCents: -4000, refundedPaymentId: 'p-1' }),
        ],
      },
    });

    expect(p.refunds).toEqual([]);
    expect(p.writeOffCents).toBe(0);
    expect(p.voidInvoice).toBe(false);
  });

  it('remboursement rattaché à aucun encaissement : refus', () => {
    const p = plan({
      invoice: {
        payments: [PAY(), PAY({ id: 'p-refund', amountCents: -500 })],
      },
    });

    expect(p.blockers).toEqual([expect.stringMatching(/rattaché à aucun encaissement/)]);
  });
});

describe('planShopOrderCancellation — le reste dû', () => {
  it('règlement partiel : rend l’acompte et éteint le reste par un avoir', () => {
    const p = plan({
      order: { status: ShopOrderStatus.PENDING, fulfilledAt: null },
      invoice: {
        status: InvoiceStatus.OPEN,
        payments: [PAY({ amountCents: 1500 })],
      },
    });

    expect(p.refunds.map((r) => r.amountCents)).toEqual([1500]);
    expect(p.writeOffCents).toBe(2500);
    expect(p.voidInvoice).toBe(false);
  });

  it('le reste dû tient compte des avoirs déjà émis', () => {
    const p = plan({
      order: { status: ShopOrderStatus.PENDING, fulfilledAt: null },
      invoice: {
        status: InvoiceStatus.OPEN,
        creditNotesCents: 500,
        payments: [PAY({ amountCents: 1500 })],
      },
    });

    expect(p.writeOffCents).toBe(2000);
  });

  it('facture sans aucun encaissement : annulée, sans avoir', () => {
    const p = plan({
      order: { status: ShopOrderStatus.PENDING, fulfilledAt: null },
      invoice: { status: InvoiceStatus.OPEN, payments: [] },
    });

    expect(p.voidInvoice).toBe(true);
    expect(p.writeOffCents).toBe(0);
    expect(p.refunds).toEqual([]);
  });

  it('facture déjà annulée : ni annulation ni avoir', () => {
    const p = plan({
      order: { status: ShopOrderStatus.PENDING, fulfilledAt: null },
      invoice: { status: InvoiceStatus.VOID, payments: [] },
    });

    expect(p.voidInvoice).toBe(false);
    expect(p.writeOffCents).toBe(0);
  });

  it('commande sans facture : rien à rendre', () => {
    const p = plan({
      order: { status: ShopOrderStatus.PENDING, fulfilledAt: null },
      invoice: null,
    });

    expect(p.refunds).toEqual([]);
    expect(p.writeOffCents).toBe(0);
    expect(p.voidInvoice).toBe(false);
    expect(p.blockers).toEqual([]);
  });
});

describe('planShopOrderCancellation — refus', () => {
  it('commande déjà annulée', () => {
    const p = plan({ order: { status: ShopOrderStatus.CANCELLED } });

    expect(p.blockers).toEqual([expect.stringMatching(/déjà annulée/)]);
  });

  it('prélèvement d’échéance en cours de dénouement', () => {
    const p = plan({ inFlightCents: 1300 });

    expect(p.blockers).toEqual([expect.stringMatching(/prélèvement/)]);
  });
});

describe('planShopOrderCancellation — la marchandise', () => {
  it('payée : les unités sorties reviennent, l’attente d’arrivage s’éteint', () => {
    const p = plan({
      order: { lines: [LINE({ quantity: 3, awaitingStockQty: 1 })] },
    });

    expect(p.exited).toBe(true);
    expect(p.lines).toEqual([
      {
        lineId: 'l-1',
        label: 'T-shirt — L',
        returnUnits: 2,
        releaseUnits: 0,
        awaitingUnits: 1,
      },
    ]);
  });

  it('en attente : les unités réservées sont libérées', () => {
    const p = plan({
      order: {
        status: ShopOrderStatus.PENDING,
        fulfilledAt: null,
        lines: [LINE({ quantity: 3, awaitingStockQty: 1 })],
      },
      invoice: { status: InvoiceStatus.OPEN, payments: [] },
    });

    expect(p.exited).toBe(false);
    expect(p.lines[0]).toEqual(
      expect.objectContaining({ returnUnits: 0, releaseUnits: 2, awaitingUnits: 1 }),
    );
  });

  it('remise avant paiement : la marchandise est sortie, elle doit revenir', () => {
    const p = plan({
      order: {
        status: ShopOrderStatus.PENDING,
        fulfilledAt: new Date('2026-09-02'),
        deliveredAt: new Date('2026-09-02'),
      },
      invoice: { status: InvoiceStatus.OPEN, payments: [] },
    });

    expect(p.exited).toBe(true);
    expect(p.delivered).toBe(true);
    expect(p.lines[0].returnUnits).toBe(2);
  });

  it('ligne sans déclinaison : aucune unité à reprendre', () => {
    const p = plan({ order: { lines: [LINE({ variantId: null, awaitingStockQty: 1 })] } });

    expect(p.lines[0]).toEqual(
      expect.objectContaining({ returnUnits: 0, releaseUnits: 0, awaitingUnits: 0 }),
    );
  });
});
