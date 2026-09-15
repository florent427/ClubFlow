import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
} from '@prisma/client';
import {
  dueCents,
  planRefunds,
  planShopOrderCancellation,
  planWriteOffs,
  ShopOrderRefundKind,
  type ShopOrderPlanInput,
  type ShopOrderPlanInvoice,
  type ShopOrderPlanPayment,
} from './shop-order-refund-plan';

/**
 * Le plan d'annulation (ADR-0019) et ses briques — rendre, éteindre —, que
 * l'ajustement d'une ligne réutilise (ADR-0020) : ce que l'admin voit avant de
 * confirmer, et ce que le service exécute. Fonctions pures — chaque cas se lit
 * en entrée/sortie.
 */

type Line = ShopOrderPlanInput['order']['lines'][number];
type Cheque = NonNullable<ShopOrderPlanPayment['cheque']>;

const T0 = new Date('2026-09-01T10:00:00Z');
const T1 = new Date('2026-09-05T10:00:00Z');
const T2 = new Date('2026-09-08T10:00:00Z');

const LINE = (over: Partial<Line> = {}): Line => ({
  id: 'l-1',
  label: 'T-shirt — L',
  quantity: 2,
  cancelledQty: 0,
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
  createdAt: T0,
  cheque: null,
  ...over,
});

const CHEQUE = (over: Partial<Cheque> = {}): Cheque => ({
  id: 'chq-1',
  number: '0012',
  status: ChequeStatus.PENDING,
  depositId: null,
  depositAccountId: null,
  ...over,
});

/** La facture de la commande, réglée en espèces. */
const INVOICE = (over: Partial<ShopOrderPlanInvoice> = {}): ShopOrderPlanInvoice => ({
  id: 'inv-1',
  supplement: false,
  status: InvoiceStatus.PAID,
  amountCents: 4000,
  creditNotesCents: 0,
  createdAt: T0,
  payments: [PAY()],
  ...over,
});

/** La facture du reste à payer d'un échange, pas encore réglée (ADR-0020). */
const SUPPLEMENT = (over: Partial<ShopOrderPlanInvoice> = {}): ShopOrderPlanInvoice =>
  INVOICE({
    id: 'inv-sup',
    supplement: true,
    status: InvoiceStatus.OPEN,
    amountCents: 1500,
    createdAt: T1,
    payments: [],
    ...over,
  });

function plan(
  over: {
    order?: Partial<ShopOrderPlanInput['order']>;
    /** Surcharge de la seule facture de la commande. */
    invoice?: Partial<ShopOrderPlanInvoice>;
    invoices?: ShopOrderPlanInvoice[];
    inFlightCents?: number;
  } = {},
) {
  return planShopOrderCancellation({
    order: {
      status: ShopOrderStatus.PAID,
      fulfilledAt: T0,
      deliveredAt: null,
      lines: [LINE()],
      ...over.order,
    },
    invoices: over.invoices ?? [INVOICE(over.invoice)],
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
        invoiceId: 'inv-1',
        amountCents: 4000,
        chequeId: null,
        chequeNumber: null,
        bankAccountId: null,
      },
    ]);
    expect(p.writeOffs).toEqual([]);
    expect(p.writeOffCents).toBe(0);
    expect(p.voidInvoiceIds).toEqual([]);
    expect(p.voidInvoice).toBe(false);
  });

  it('virement : rendu par virement', () => {
    const p = plan({
      invoice: { payments: [PAY({ method: ClubPaymentMethod.MANUAL_TRANSFER })] },
    });

    expect(p.refunds.map((r) => r.kind)).toEqual([ShopOrderRefundKind.TRANSFER]);
  });

  it('crédit du payeur : rendu à son crédit (ADR-0022)', () => {
    const p = plan({
      invoice: { payments: [PAY({ method: ClubPaymentMethod.PAYER_CREDIT })] },
    });

    expect(p.blockers).toEqual([]);
    expect(p.refunds).toEqual([
      expect.objectContaining({
        kind: ShopOrderRefundKind.CREDIT,
        paymentId: 'p-1',
        amountCents: 4000,
        bankAccountId: null,
      }),
    ]);
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

  it('chèque en portefeuille : rendu à l’adhérent, en entier', () => {
    const p = plan({
      invoice: {
        payments: [PAY({ method: ClubPaymentMethod.MANUAL_CHECK, cheque: CHEQUE() })],
      },
    });

    expect(p.refunds).toEqual([
      expect.objectContaining({
        kind: ShopOrderRefundKind.CHEQUE_RETURN,
        amountCents: 4000,
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
            cheque: CHEQUE({
              status: ChequeStatus.DEPOSITED,
              depositId: 'dep-1',
              depositAccountId: 'fa-banque',
            }),
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
            cheque: CHEQUE({ status, depositId, depositAccountId }),
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

  it('plusieurs encaissements : le plus récent rendu d’abord, chacun par son moyen', () => {
    const p = plan({
      invoice: {
        payments: [
          PAY({ id: 'p-cash', amountCents: 1000, createdAt: T0 }),
          PAY({
            id: 'p-card',
            amountCents: 3000,
            method: ClubPaymentMethod.STRIPE_CARD,
            externalRef: 'pi_1',
            createdAt: T1,
          }),
        ],
      },
    });

    expect(p.refunds.map((r) => [r.paymentId, r.kind, r.amountCents])).toEqual([
      ['p-card', ShopOrderRefundKind.CARD, 3000],
      ['p-cash', ShopOrderRefundKind.CASH, 1000],
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
          PAY({ method: ClubPaymentMethod.STRIPE_CARD, externalRef: 'pi_1' }),
          PAY({
            id: 'p-refund',
            amountCents: -1000,
            refundedPaymentId: 'p-1',
            createdAt: T1,
          }),
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
  const EN_ATTENTE = { status: ShopOrderStatus.PENDING, fulfilledAt: null };

  it('règlement partiel : rend l’acompte et éteint le reste par un avoir', () => {
    const p = plan({
      order: EN_ATTENTE,
      invoice: {
        status: InvoiceStatus.OPEN,
        payments: [PAY({ amountCents: 1500 })],
      },
    });

    expect(p.refunds.map((r) => r.amountCents)).toEqual([1500]);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-1', amountCents: 2500 }]);
    expect(p.writeOffCents).toBe(2500);
    expect(p.voidInvoice).toBe(false);
  });

  it('le reste dû tient compte des avoirs déjà émis', () => {
    const p = plan({
      order: EN_ATTENTE,
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
      order: EN_ATTENTE,
      invoice: { status: InvoiceStatus.OPEN, payments: [] },
    });

    expect(p.voidInvoiceIds).toEqual(['inv-1']);
    expect(p.voidInvoice).toBe(true);
    expect(p.writeOffCents).toBe(0);
    expect(p.refunds).toEqual([]);
  });

  it('facture déjà annulée : ni annulation ni avoir', () => {
    const p = plan({
      order: EN_ATTENTE,
      invoice: { status: InvoiceStatus.VOID, payments: [] },
    });

    expect(p.voidInvoice).toBe(false);
    expect(p.writeOffCents).toBe(0);
  });

  it('commande sans facture : rien à rendre', () => {
    const p = plan({ order: EN_ATTENTE, invoices: [] });

    expect(p.refunds).toEqual([]);
    expect(p.writeOffCents).toBe(0);
    expect(p.voidInvoice).toBe(false);
    expect(p.blockers).toEqual([]);
  });
});

describe('planShopOrderCancellation — les factures d’un échange (ADR-0020)', () => {
  it('le reste à payer réglé est rendu avant la commande, chacun sur sa facture', () => {
    const p = plan({
      invoices: [
        INVOICE(),
        SUPPLEMENT({
          status: InvoiceStatus.PAID,
          payments: [
            PAY({
              id: 'p-sup',
              amountCents: 1500,
              method: ClubPaymentMethod.STRIPE_CARD,
              externalRef: 'pi_sup',
              createdAt: T1,
            }),
          ],
        }),
      ],
    });

    expect(p.blockers).toEqual([]);
    expect(
      p.refunds.map((r) => [r.paymentId, r.invoiceId, r.kind, r.amountCents]),
    ).toEqual([
      ['p-sup', 'inv-sup', ShopOrderRefundKind.CARD, 1500],
      ['p-1', 'inv-1', ShopOrderRefundKind.CASH, 4000],
    ]);
    expect(p.writeOffs).toEqual([]);
    expect(p.voidInvoiceIds).toEqual([]);
  });

  it('reste à payer jamais réglé : annulé, sans avoir', () => {
    const p = plan({ invoices: [INVOICE(), SUPPLEMENT()] });

    expect(p.refunds.map((r) => r.paymentId)).toEqual(['p-1']);
    expect(p.voidInvoiceIds).toEqual(['inv-sup']);
    expect(p.voidInvoice).toBe(true);
    expect(p.writeOffs).toEqual([]);
  });

  it('reste à payer en partie réglé : l’acompte est rendu, le reste éteint sur SA facture', () => {
    const p = plan({
      invoices: [
        INVOICE(),
        SUPPLEMENT({
          payments: [PAY({ id: 'p-sup', amountCents: 500, createdAt: T1 })],
        }),
      ],
    });

    expect(p.refunds.map((r) => [r.paymentId, r.invoiceId, r.amountCents])).toEqual([
      ['p-sup', 'inv-sup', 500],
      ['p-1', 'inv-1', 4000],
    ]);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-sup', amountCents: 1000 }]);
    expect(p.voidInvoiceIds).toEqual([]);
  });

  it('reste à payer déjà annulé : ignoré', () => {
    const p = plan({
      invoices: [INVOICE(), SUPPLEMENT({ status: InvoiceStatus.VOID })],
    });

    expect(p.refunds.map((r) => r.paymentId)).toEqual(['p-1']);
    expect(p.voidInvoiceIds).toEqual([]);
    expect(p.writeOffs).toEqual([]);
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

  it('les unités retirées de la commande ne reviennent pas une seconde fois (ADR-0020)', () => {
    const p = plan({
      order: {
        lines: [
          LINE({ quantity: 3, cancelledQty: 1 }),
          LINE({ id: 'l-2', label: 'Short — M', quantity: 1, cancelledQty: 1 }),
        ],
      },
    });

    expect(p.lines.map((l) => [l.lineId, l.returnUnits])).toEqual([
      ['l-1', 2],
      ['l-2', 0],
    ]);
  });
});

describe('planRefunds — rendre une part (ADR-0020)', () => {
  it('du plus récent encaissement au plus ancien, toutes factures confondues', () => {
    const blockers: string[] = [];
    const invoices = [
      INVOICE({
        payments: [
          PAY({ id: 'p-ancien', amountCents: 3000, createdAt: T0 }),
          PAY({
            id: 'p-recent',
            amountCents: 1000,
            method: ClubPaymentMethod.MANUAL_TRANSFER,
            createdAt: T1,
          }),
        ],
      }),
      SUPPLEMENT({
        status: InvoiceStatus.PAID,
        payments: [PAY({ id: 'p-sup', amountCents: 500, createdAt: T2 })],
      }),
    ];

    expect(
      planRefunds(invoices, 2000, blockers).map((r) => [
        r.paymentId,
        r.invoiceId,
        r.kind,
        r.amountCents,
      ]),
    ).toEqual([
      ['p-sup', 'inv-sup', ShopOrderRefundKind.CASH, 500],
      ['p-recent', 'inv-1', ShopOrderRefundKind.TRANSFER, 1000],
      ['p-ancien', 'inv-1', ShopOrderRefundKind.CASH, 500],
    ]);
    expect(blockers).toEqual([]);
  });

  it('à date égale, le même ordre quel que soit l’ordre de lecture', () => {
    const a = PAY({ id: 'p-a', amountCents: 1000 });
    const b = PAY({
      id: 'p-b',
      amountCents: 1000,
      method: ClubPaymentMethod.MANUAL_TRANSFER,
    });
    const rendu = (payments: ShopOrderPlanPayment[]) =>
      planRefunds([INVOICE({ amountCents: 2000, payments })], 1000, []).map(
        (r) => r.paymentId,
      );

    expect(rendu([a, b])).toEqual(['p-b']);
    expect(rendu([b, a])).toEqual(['p-b']);
  });

  it('chèque en portefeuille : rendu entier s’il est tout rendu, sinon sa part reversée par virement', () => {
    const invoices = [
      INVOICE({
        payments: [PAY({ method: ClubPaymentMethod.MANUAL_CHECK, cheque: CHEQUE() })],
      }),
    ];
    const attendu = (kind: ShopOrderRefundKind, amountCents: number) => [
      {
        kind,
        paymentId: 'p-1',
        invoiceId: 'inv-1',
        amountCents,
        chequeId: 'chq-1',
        chequeNumber: '0012',
        bankAccountId: null,
      },
    ];

    expect(planRefunds(invoices, 4000, [])).toEqual(
      attendu(ShopOrderRefundKind.CHEQUE_RETURN, 4000),
    );
    expect(planRefunds(invoices, 1500, [])).toEqual(
      attendu(ShopOrderRefundKind.CHEQUE_PARTIAL, 1500),
    );
  });

  it('chèque dont une part a déjà été reversée : il ne se rend plus entier', () => {
    const invoices = [
      INVOICE({
        creditNotesCents: 1000,
        payments: [
          PAY({ method: ClubPaymentMethod.MANUAL_CHECK, cheque: CHEQUE() }),
          PAY({
            id: 'p-part',
            amountCents: -1000,
            method: ClubPaymentMethod.MANUAL_TRANSFER,
            refundedPaymentId: 'p-1',
            createdAt: T1,
          }),
        ],
      }),
    ];

    expect(planRefunds(invoices, 3000, []).map((r) => [r.kind, r.amountCents])).toEqual([
      [ShopOrderRefundKind.CHEQUE_PARTIAL, 3000],
    ]);
  });

  it('au-delà de ce qui a été encaissé : refus', () => {
    const blockers: string[] = [];

    planRefunds([INVOICE()], 5000, blockers);

    expect(blockers).toEqual([expect.stringMatching(/dépasse ce qui a été encaissé/)]);
  });

  it('rien à rendre : aucune action, aucun refus', () => {
    const blockers: string[] = [];

    expect(planRefunds([INVOICE()], 0, blockers)).toEqual([]);
    expect(blockers).toEqual([]);
  });

  it('une facture annulée ne rend rien', () => {
    const blockers: string[] = [];

    expect(planRefunds([INVOICE({ status: InvoiceStatus.VOID })], 1000, blockers)).toEqual([]);
    expect(blockers).toEqual([expect.stringMatching(/dépasse/)]);
  });
});

describe('planWriteOffs — éteindre ce qui reste dû (ADR-0020)', () => {
  it('le reste à payer d’abord, du plus récent au plus ancien, puis la commande', () => {
    const invoices = [
      INVOICE({ status: InvoiceStatus.OPEN, payments: [PAY({ amountCents: 1000 })] }),
      SUPPLEMENT({
        id: 'inv-sup-ancien',
        createdAt: T1,
        payments: [PAY({ id: 'p-s1', amountCents: 500 })],
      }),
      SUPPLEMENT({
        id: 'inv-sup-recent',
        amountCents: 1000,
        createdAt: T2,
        payments: [PAY({ id: 'p-s2', amountCents: 200 })],
      }),
    ];

    expect(planWriteOffs(invoices, 2000, [])).toEqual({
      writeOffs: [
        { invoiceId: 'inv-sup-recent', amountCents: 800 },
        { invoiceId: 'inv-sup-ancien', amountCents: 1000 },
        { invoiceId: 'inv-1', amountCents: 200 },
      ],
      voidInvoiceIds: [],
      uncoveredCents: 0,
    });
  });

  it('le reste à payer passe avant la commande, même daté plus tôt', () => {
    const invoices = [
      INVOICE({
        status: InvoiceStatus.OPEN,
        createdAt: T2,
        payments: [PAY({ amountCents: 1000 })],
      }),
      SUPPLEMENT({ createdAt: T1, payments: [PAY({ id: 'p-sup', amountCents: 500 })] }),
    ];

    expect(planWriteOffs(invoices, 600, []).writeOffs).toEqual([
      { invoiceId: 'inv-sup', amountCents: 600 },
    ]);
  });

  it('reste à payer sans encaissement ni avoir, entièrement éteint : annulé plutôt que couvert d’un avoir', () => {
    const invoices = [
      INVOICE({ status: InvoiceStatus.OPEN, payments: [PAY({ amountCents: 1000 })] }),
      SUPPLEMENT(),
    ];

    expect(planWriteOffs(invoices, 2000, [])).toEqual({
      writeOffs: [{ invoiceId: 'inv-1', amountCents: 500 }],
      voidInvoiceIds: ['inv-sup'],
      uncoveredCents: 0,
    });
  });

  it('éteint en partie seulement : un avoir, pas une annulation', () => {
    expect(planWriteOffs([SUPPLEMENT()], 1000, [])).toEqual({
      writeOffs: [{ invoiceId: 'inv-sup', amountCents: 1000 }],
      voidInvoiceIds: [],
      uncoveredCents: 0,
    });
  });

  it('une facture qui porte déjà un avoir n’est pas annulée', () => {
    expect(planWriteOffs([SUPPLEMENT({ creditNotesCents: 500 })], 1500, [])).toEqual({
      writeOffs: [{ invoiceId: 'inv-sup', amountCents: 1000 }],
      voidInvoiceIds: [],
      uncoveredCents: 500,
    });
  });

  it('rien de dû : ce qui reste est rendu à l’appelant', () => {
    expect(
      planWriteOffs([INVOICE(), SUPPLEMENT({ status: InvoiceStatus.VOID })], 700, []),
    ).toEqual({ writeOffs: [], voidInvoiceIds: [], uncoveredCents: 700 });
  });
});

describe('dueCents — le reste dû d’une facture', () => {
  it('le montant, moins les avoirs et les encaissements nets', () => {
    expect(
      dueCents(
        INVOICE({
          status: InvoiceStatus.OPEN,
          creditNotesCents: 1000,
          payments: [
            PAY({ amountCents: 2500 }),
            PAY({ id: 'p-r', amountCents: -500, refundedPaymentId: 'p-1', createdAt: T1 }),
          ],
        }),
        [],
      ),
    ).toBe(1000);
  });

  it('jamais négatif, et nul pour une facture annulée', () => {
    expect(
      dueCents(INVOICE({ status: InvoiceStatus.OPEN, payments: [PAY({ amountCents: 5000 })] }), []),
    ).toBe(0);
    expect(dueCents(INVOICE({ status: InvoiceStatus.VOID, payments: [] }), [])).toBe(0);
  });
});
