import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
} from '@prisma/client';
import {
  planShopOrderAdjustment,
  type AdjustmentNewItem,
  type AdjustmentPlanLine,
  type ShopOrderAdjustmentPlanInput,
} from './shop-order-adjustment-plan';
import {
  ShopOrderRefundKind,
  type ShopOrderPlanInvoice,
  type ShopOrderPlanPayment,
} from './shop-order-refund-plan';

/**
 * Le plan d'un ajustement de commande — annulation d'articles ou échange
 * (ADR-0020) : ce que l'admin voit avant de confirmer, et ce que le service
 * exécute. Fonction pure — chaque cas se lit en entrée/sortie.
 */

const T0 = new Date('2026-09-01T10:00:00Z');
const T1 = new Date('2026-09-05T10:00:00Z');

/** Deux t-shirts L à 20 €. */
const LINE = (over: Partial<AdjustmentPlanLine> = {}): AdjustmentPlanLine => ({
  id: 'l-1',
  label: 'T-shirt — L',
  quantity: 2,
  cancelledQty: 0,
  awaitingStockQty: 0,
  variantId: 'v-1',
  unitPriceCents: 2000,
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

/** La facture du reste à payer d'un échange précédent, pas encore réglée. */
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

/** L'article pris en échange, tel qu'il est en vente. */
const ITEM = (over: Partial<AdjustmentNewItem> = {}): AdjustmentNewItem => ({
  variantId: 'v-2',
  label: 'Kimono 140',
  unitPriceCents: 2000,
  active: true,
  trackStock: true,
  available: 5,
  preorderEnabled: false,
  ...over,
});

const exchange = (item: Partial<AdjustmentNewItem> | null = {}, newQty = 1) => ({
  newQty,
  item: item === null ? null : ITEM(item),
});

type Over = Partial<Omit<ShopOrderAdjustmentPlanInput, 'order'>> & {
  order?: Partial<ShopOrderAdjustmentPlanInput['order']>;
};

/** Par défaut : commande payée, sortie du stock, pas remise ; on retire 1 t-shirt. */
function plan(over: Over = {}) {
  const { order, ...rest } = over;
  return planShopOrderAdjustment({
    order: {
      status: ShopOrderStatus.PAID,
      fulfilledAt: T0,
      deliveredAt: null,
      lines: [LINE()],
      ...order,
    },
    lineId: 'l-1',
    qty: 1,
    exchange: null,
    goodsReturned: false,
    goodsLost: false,
    invoices: [INVOICE()],
    inFlightCents: 0,
    ...rest,
  });
}

/** En attente, réservée mais pas sortie. */
const PENDING = { status: ShopOrderStatus.PENDING, fulfilledAt: null };
/** Remise à l'adhérent. */
const DELIVERED = { fulfilledAt: T0, deliveredAt: T0 };
const UNPAID = () => [INVOICE({ status: InvoiceStatus.OPEN, payments: [] })];

describe('planShopOrderAdjustment — annuler un article', () => {
  it('commande payée en espèces : l’article revient au stock, sa part est rendue', () => {
    expect(plan()).toEqual({
      blockers: [],
      delivered: false,
      exited: true,
      signatureRequired: false,
      removedCents: 2000,
      addedCents: 0,
      differenceCents: -2000,
      goods: { fromAwaiting: 0, releaseUnits: 0, returnUnits: 1 },
      newItem: null,
      supplementCents: 0,
      refunds: [
        {
          kind: ShopOrderRefundKind.CASH,
          paymentId: 'p-1',
          invoiceId: 'inv-1',
          amountCents: 2000,
          chequeId: null,
          chequeNumber: null,
          bankAccountId: null,
        },
      ],
      refundCents: 2000,
      writeOffs: [],
      writeOffCents: 0,
      voidInvoiceIds: [],
      settleInvoiceIds: [],
      settlesOrder: false,
    });
  });

  it('en attente, rien d’encaissé : la réservation est libérée, la part éteinte par un avoir', () => {
    const p = plan({ order: PENDING, invoices: UNPAID() });

    expect(p.blockers).toEqual([]);
    expect(p.exited).toBe(false);
    expect(p.goods).toEqual({ fromAwaiting: 0, releaseUnits: 1, returnUnits: 0 });
    expect(p.refunds).toEqual([]);
    expect(p.refundCents).toBe(0);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-1', amountCents: 2000 }]);
    expect(p.writeOffCents).toBe(2000);
    expect(p.voidInvoiceIds).toEqual([]);
    expect(p.settleInvoiceIds).toEqual([]);
    expect(p.settlesOrder).toBe(false);
  });

  it('acompte au-delà du nouveau total : le trop-perçu est rendu, le reste éteint, et la commande est réglée', () => {
    const p = plan({
      order: PENDING,
      invoices: [
        INVOICE({ status: InvoiceStatus.OPEN, payments: [PAY({ amountCents: 3000 })] }),
      ],
    });

    expect(p.blockers).toEqual([]);
    expect(p.refunds.map((r) => [r.kind, r.amountCents])).toEqual([
      [ShopOrderRefundKind.CASH, 1000],
    ]);
    expect(p.refundCents).toBe(1000);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-1', amountCents: 1000 }]);
    expect(p.settleInvoiceIds).toEqual(['inv-1']);
    expect(p.settlesOrder).toBe(true);
  });

  it('acompte en deçà du nouveau total : rien à rendre, la part est éteinte, il reste dû', () => {
    const p = plan({
      order: PENDING,
      invoices: [
        INVOICE({ status: InvoiceStatus.OPEN, payments: [PAY({ amountCents: 1000 })] }),
      ],
    });

    expect(p.refunds).toEqual([]);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-1', amountCents: 2000 }]);
    expect(p.settleInvoiceIds).toEqual([]);
    expect(p.settlesOrder).toBe(false);
  });

  it('chèque encore en portefeuille : sa part est reversée par virement, le chèque reste à remettre', () => {
    const p = plan({
      invoices: [
        INVOICE({
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
        }),
      ],
    });

    expect(p.refunds).toEqual([
      {
        kind: ShopOrderRefundKind.CHEQUE_PARTIAL,
        paymentId: 'p-1',
        invoiceId: 'inv-1',
        amountCents: 2000,
        chequeId: 'chq-1',
        chequeNumber: '0012',
        bankAccountId: null,
      },
    ]);
  });

  it('commande remise, article rapporté : il revient au stock, sans signature', () => {
    const p = plan({ order: DELIVERED, goodsReturned: true });

    expect(p.blockers).toEqual([]);
    expect(p.delivered).toBe(true);
    expect(p.signatureRequired).toBe(false);
    expect(p.goods.returnUnits).toBe(1);
  });

  it('commande sans facture, antérieure à la facturation : l’article est retiré, aucun argent ne bouge', () => {
    const p = plan({ order: PENDING, invoices: [] });

    expect(p.blockers).toEqual([]);
    expect(p.refunds).toEqual([]);
    expect(p.refundCents).toBe(0);
    expect(p.writeOffs).toEqual([]);
    expect(p.supplementCents).toBe(0);
  });

  it('facture déjà en partie éteinte par des avoirs : ne rend que ce qui a été encaissé', () => {
    const p = plan({
      order: PENDING,
      invoices: [
        INVOICE({
          status: InvoiceStatus.OPEN,
          creditNotesCents: 3000,
          payments: [PAY({ amountCents: 1000 })],
        }),
      ],
    });

    expect(p.blockers).toEqual([]);
    expect(p.refunds.map((r) => [r.kind, r.amountCents])).toEqual([
      [ShopOrderRefundKind.CASH, 1000],
    ]);
    expect(p.writeOffs).toEqual([]);
  });
});

describe('planShopOrderAdjustment — refus', () => {
  it('commande annulée : refus, sans rien calculer', () => {
    const p = plan({ order: { status: ShopOrderStatus.CANCELLED } });

    expect(p.blockers).toEqual([expect.stringMatching(/Cette commande est annulée/)]);
    expect(p.removedCents).toBe(0);
    expect(p.refunds).toEqual([]);
  });

  it('article introuvable dans la commande', () => {
    const p = plan({ lineId: 'l-inconnue' });

    expect(p.blockers).toEqual([expect.stringMatching(/Article introuvable/)]);
  });

  it.each([0, 3, 1.5, -1])('quantité %p : refus, sans rien calculer', (qty) => {
    const p = plan({ qty });

    expect(p.blockers).toEqual([expect.stringMatching(/Quantité invalide\W+entre 1 et 2/)]);
    expect(p.removedCents).toBe(0);
  });

  it('la quantité se lit sur les unités encore dans la commande', () => {
    const lignes = [
      LINE({ quantity: 3, cancelledQty: 1 }),
      LINE({ id: 'l-2', variantId: 'v-9' }),
    ];

    expect(plan({ order: { lines: lignes }, qty: 3 }).blockers).toEqual([
      expect.stringMatching(/Quantité invalide\W+entre 1 et 2/),
    ]);
    expect(plan({ order: { lines: lignes }, qty: 2 }).blockers).toEqual([]);
  });

  it('article déjà entièrement retiré', () => {
    const p = plan({
      order: {
        lines: [LINE({ cancelledQty: 2 }), LINE({ id: 'l-2', variantId: 'v-9' })],
      },
    });

    expect(p.blockers).toEqual([expect.stringMatching(/déjà entièrement retiré/)]);
  });

  it('commande remise sans l’article : refus', () => {
    const p = plan({ order: DELIVERED });

    expect(p.blockers).toEqual([expect.stringMatching(/doit rapporter l’article/)]);
  });

  it('article déclaré perdu : permis s’il a quitté le club, refusé sinon', () => {
    expect(plan({ goodsLost: true }).blockers).toEqual([]);
    expect(
      plan({ order: PENDING, invoices: UNPAID(), goodsLost: true }).blockers,
    ).toEqual([expect.stringMatching(/ne peut pas être déclaré perdu/)]);
  });

  it('prélèvement d’échéance en cours de dénouement', () => {
    const p = plan({ inFlightCents: 1300 });

    expect(p.blockers).toEqual([expect.stringMatching(/prélèvement d’échéance/)]);
  });

  it('dernier article de la commande : il faut annuler la commande', () => {
    expect(plan({ order: { lines: [LINE({ quantity: 1 })] } }).blockers).toEqual([
      expect.stringMatching(/dernier article de la commande/),
    ]);
    // Échangé, il ne l'est plus : la commande garde un article.
    expect(
      plan({ order: { lines: [LINE({ quantity: 1 })] }, exchange: exchange() }).blockers,
    ).toEqual([]);
    // Toute une ligne, tant qu'il en reste une autre.
    expect(
      plan({ order: { lines: [LINE(), LINE({ id: 'l-2', variantId: 'v-9' })] }, qty: 2 })
        .blockers,
    ).toEqual([]);
  });

  it('règlement par carte sans référence Stripe : refus', () => {
    const p = plan({
      invoices: [
        INVOICE({
          payments: [PAY({ method: ClubPaymentMethod.STRIPE_CARD, externalRef: 'cs_1' })],
        }),
      ],
    });

    expect(p.blockers).toEqual([expect.stringMatching(/référence Stripe/)]);
  });
});

describe('planShopOrderAdjustment — la marchandise', () => {
  it('ce qui attendait l’arrivage est retiré en premier', () => {
    const p = plan({
      order: {
        ...PENDING,
        lines: [
          LINE({ quantity: 3, awaitingStockQty: 2 }),
          LINE({ id: 'l-2', variantId: 'v-9', quantity: 1 }),
        ],
      },
      invoices: UNPAID(),
      qty: 3,
    });

    expect(p.goods).toEqual({ fromAwaiting: 2, releaseUnits: 1, returnUnits: 0 });
  });

  it('payée, en partie en attente : l’attente d’abord, puis le retour au stock', () => {
    const p = plan({
      order: { lines: [LINE({ quantity: 3, awaitingStockQty: 1 })] },
      qty: 2,
    });

    expect(p.goods).toEqual({ fromAwaiting: 1, releaseUnits: 0, returnUnits: 1 });
  });

  it('ligne sans déclinaison : rien à reprendre', () => {
    const p = plan({ order: { lines: [LINE({ variantId: null })] } });

    expect(p.goods).toEqual({ fromAwaiting: 0, releaseUnits: 0, returnUnits: 0 });
  });
});

describe('planShopOrderAdjustment — échanger', () => {
  it('plus cher : la différence devient un reste à payer, rien n’est rendu', () => {
    expect(plan({ exchange: exchange({ unitPriceCents: 3500 }) })).toEqual({
      blockers: [],
      delivered: false,
      exited: true,
      signatureRequired: false,
      removedCents: 2000,
      addedCents: 3500,
      differenceCents: 1500,
      goods: { fromAwaiting: 0, releaseUnits: 0, returnUnits: 1 },
      newItem: {
        label: 'Kimono 140',
        unitPriceCents: 3500,
        quantity: 1,
        reservedUnits: 1,
        awaitingUnits: 0,
      },
      supplementCents: 1500,
      refunds: [],
      refundCents: 0,
      writeOffs: [],
      writeOffCents: 0,
      voidInvoiceIds: [],
      settleInvoiceIds: [],
      settlesOrder: false,
    });
  });

  it('moins cher : la différence est rendue', () => {
    const p = plan({ exchange: exchange({ unitPriceCents: 1200 }) });

    expect(p.differenceCents).toBe(-800);
    expect(p.supplementCents).toBe(0);
    expect(p.refunds.map((r) => [r.kind, r.amountCents])).toEqual([
      [ShopOrderRefundKind.CASH, 800],
    ]);
  });

  it('même prix : aucun mouvement d’argent', () => {
    const p = plan({ exchange: exchange() });

    expect(p.differenceCents).toBe(0);
    expect(p.supplementCents).toBe(0);
    expect(p.refunds).toEqual([]);
    expect(p.writeOffs).toEqual([]);
  });

  it('un article contre deux : la quantité prise compte', () => {
    const p = plan({ exchange: exchange({ unitPriceCents: 1500 }, 2) });

    expect(p.addedCents).toBe(3000);
    expect(p.supplementCents).toBe(1000);
    expect(p.newItem).toEqual(expect.objectContaining({ quantity: 2, reservedUnits: 2 }));
  });

  it('commande remise : l’échange se signe', () => {
    const p = plan({ order: DELIVERED, goodsReturned: true, exchange: exchange() });

    expect(p.blockers).toEqual([]);
    expect(p.signatureRequired).toBe(true);
  });

  it('nouvel article introuvable ou retiré de la vente : refus', () => {
    for (const p of [
      plan({ exchange: exchange(null) }),
      plan({ exchange: exchange({ active: false }) }),
    ]) {
      expect(p.blockers).toEqual([expect.stringMatching(/n’est pas en vente/)]);
      expect(p.newItem).toBeNull();
      expect(p.addedCents).toBe(0);
    }
  });

  it('aucune quantité prise : refus', () => {
    const p = plan({ exchange: { newQty: 0, item: ITEM() } });

    expect(p.blockers).toEqual([expect.stringMatching(/combien d’articles/)]);
  });

  it('épuisé, sans précommande : refus', () => {
    const p = plan({ exchange: exchange({ available: 0 }) });

    expect(p.blockers).toEqual([
      expect.stringMatching(/^Stock insuffisant pour\W+Kimono 140\W+0 disponible/),
    ]);
    expect(p.newItem).toEqual(expect.objectContaining({ reservedUnits: 0, awaitingUnits: 1 }));
  });

  it('épuisé mais en précommande, commande pas encore remise : il attend l’arrivage', () => {
    const p = plan({ exchange: exchange({ available: 0, preorderEnabled: true }) });

    expect(p.blockers).toEqual([]);
    expect(p.newItem).toEqual(expect.objectContaining({ reservedUnits: 0, awaitingUnits: 1 }));
  });

  it('en partie disponible, en précommande : le manque attend l’arrivage', () => {
    const p = plan({ exchange: exchange({ available: 2, preorderEnabled: true }, 3) });

    expect(p.blockers).toEqual([]);
    expect(p.newItem).toEqual(expect.objectContaining({ reservedUnits: 2, awaitingUnits: 1 }));
  });

  it('commande remise : le nouvel article doit être là, précommande ou non', () => {
    const p = plan({
      order: DELIVERED,
      goodsReturned: true,
      exchange: exchange({ available: 0, preorderEnabled: true }),
    });

    expect(p.blockers).toEqual([
      expect.stringMatching(/^Stock insuffisant pour remettre\W+Kimono 140\W+0 disponible/),
    ]);
  });

  it('stock non suivi : tout est servi', () => {
    const p = plan({ exchange: exchange({ trackStock: false, available: 0 }, 3) });

    expect(p.blockers).toEqual([]);
    expect(p.newItem).toEqual(expect.objectContaining({ reservedUnits: 3, awaitingUnits: 0 }));
  });

  it('même déclinaison : l’article rendu sert l’échange, sauf s’il est déclaré perdu', () => {
    const identique = exchange({ variantId: 'v-1', label: 'T-shirt — L', available: 0 });

    const rendu = plan({ exchange: identique });
    expect(rendu.blockers).toEqual([]);
    expect(rendu.newItem).toEqual(expect.objectContaining({ reservedUnits: 1, awaitingUnits: 0 }));

    const libere = plan({ order: PENDING, invoices: UNPAID(), exchange: identique });
    expect(libere.newItem).toEqual(expect.objectContaining({ reservedUnits: 1 }));

    const perdu = plan({ exchange: identique, goodsLost: true });
    expect(perdu.newItem).toEqual(expect.objectContaining({ reservedUnits: 0, awaitingUnits: 1 }));
    expect(perdu.blockers).toEqual([expect.stringMatching(/Stock insuffisant/)]);
  });
});

describe('planShopOrderAdjustment — les factures d’un échange précédent', () => {
  /** Après un premier échange : un t-shirt L gardé, un kimono à 35 € pris. */
  const LIGNES = [
    LINE({ cancelledQty: 1 }),
    LINE({ id: 'l-2', label: 'Kimono 140', variantId: 'v-2', quantity: 1, unitPriceCents: 3500 }),
  ];

  it('le reste à payer réglé est rendu avant la commande', () => {
    const p = plan({
      order: { lines: LIGNES },
      lineId: 'l-2',
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
      ['p-1', 'inv-1', ShopOrderRefundKind.CASH, 2000],
    ]);
    expect(p.refundCents).toBe(3500);
    expect(p.writeOffs).toEqual([]);
  });

  it('reste à payer jamais réglé : annulé, et seul le trop-perçu est rendu', () => {
    const p = plan({
      order: { lines: LIGNES },
      lineId: 'l-2',
      invoices: [INVOICE(), SUPPLEMENT()],
    });

    expect(p.refunds.map((r) => [r.paymentId, r.invoiceId, r.amountCents])).toEqual([
      ['p-1', 'inv-1', 2000],
    ]);
    expect(p.voidInvoiceIds).toEqual(['inv-sup']);
    expect(p.writeOffs).toEqual([]);
    expect(p.writeOffCents).toBe(0);
  });

  it('reste à payer en partie réglé, soldé par l’échange : sa facture est soldée, la commande reste payée', () => {
    const p = plan({
      order: { lines: LIGNES },
      lineId: 'l-2',
      exchange: exchange({ variantId: 'v-3', unitPriceCents: 3000 }),
      invoices: [
        INVOICE(),
        SUPPLEMENT({
          payments: [
            PAY({
              id: 'p-sup',
              amountCents: 1000,
              method: ClubPaymentMethod.STRIPE_CARD,
              externalRef: 'pi_sup',
              createdAt: T1,
            }),
          ],
        }),
      ],
    });

    expect(p.blockers).toEqual([]);
    expect(p.refunds).toEqual([]);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-sup', amountCents: 500 }]);
    expect(p.settleInvoiceIds).toEqual(['inv-sup']);
    expect(p.settlesOrder).toBe(false);
  });

  it('échange qui solde la facture d’une commande en attente : la commande passe payée', () => {
    const p = plan({
      order: PENDING,
      exchange: exchange({ unitPriceCents: 1000 }),
      invoices: [
        INVOICE({ status: InvoiceStatus.OPEN, payments: [PAY({ amountCents: 3000 })] }),
      ],
    });

    expect(p.blockers).toEqual([]);
    expect(p.refunds).toEqual([]);
    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-1', amountCents: 1000 }]);
    expect(p.settleInvoiceIds).toEqual(['inv-1']);
    expect(p.settlesOrder).toBe(true);
  });
});

describe('planShopOrderAdjustment — cas limites', () => {
  it('moins d’articles retirés qu’il n’en attend l’arrivage : seule l’attente baisse', () => {
    const p = plan({
      order: { ...PENDING, lines: [LINE({ quantity: 3, awaitingStockQty: 2 })] },
      invoices: UNPAID(),
      qty: 1,
    });

    expect(p.goods).toEqual({ fromAwaiting: 1, releaseUnits: 0, returnUnits: 0 });
  });

  it('facture sans encaissement, entièrement éteinte : jamais « payée »', () => {
    const p = plan({
      order: PENDING,
      invoices: [
        INVOICE({ status: InvoiceStatus.OPEN, creditNotesCents: 2000, payments: [] }),
      ],
    });

    expect(p.writeOffs).toEqual([{ invoiceId: 'inv-1', amountCents: 2000 }]);
    expect(p.settleInvoiceIds).toEqual([]);
    expect(p.settlesOrder).toBe(false);
  });
});
