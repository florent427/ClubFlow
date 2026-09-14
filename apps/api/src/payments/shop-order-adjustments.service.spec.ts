import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderAdjustmentKind,
  ShopOrderStatus,
  ShopStockMovementKind,
} from '@prisma/client';
import {
  ADJUSTMENT,
  CHEQUE,
  INVOICE,
  LINE,
  ORDER,
  PAYMENT,
  PENDING,
  PNG,
  PRODUCT,
  SUPPLEMENT,
  T0,
  T1,
  VARIANT,
  makeWorld,
  type World,
} from '../../test/shop-order-world';
import type { ShopOrderLineAdjustmentInput } from './shop-order-adjustments.service';

/**
 * Échanger ou annuler un article d'une commande (ADR-0020), de bout en bout :
 * le vrai `ShopService`, le vrai moteur de stock, le vrai service d'avoirs et
 * `ShopOrderMoneyService`, sur le double de PostgreSQL de
 * `test/shop-order-world.ts` — qui applique chaque clause des `where`, lève
 * sur celles qu'il ne sait pas simuler et fait un ROLLBACK réel.
 *
 * Seule la différence entre ce qui est retiré et ce qui est pris déplace de
 * l'argent : rendue par le moyen de chaque encaissement, éteinte par avoir, ou
 * facturée à part.
 */

/** Kimono taille 140, à 35 € : l'article pris en échange. */
const KIMONO = (over: Parameters<typeof VARIANT>[0] = {}) =>
  VARIANT({ id: 'v-2', productId: 'p-2', label: '140', onHand: 4, available: 4, ...over });

type AdjustInput = ShopOrderLineAdjustmentInput & {
  reason: string;
  signerName?: string | null;
  signaturePng?: string | null;
};

const adjust = (h: World, over: Partial<AdjustInput> = {}) =>
  h.adjust.adjust('club-1', 'u-admin', {
    orderId: 'order-1',
    lineId: 'line-1',
    quantity: 1,
    reason: 'Taille',
    ...over,
  });

/** La ligne créée par l'échange. */
const takenLine = (h: World) =>
  h.orders[0].lines.find((l) => !['line-1', 'line-2'].includes(l.id))!;

describe('adjust — annuler un article', () => {
  it('commande payée en espèces : l’article revient au stock, sa part est rendue', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    const res = await adjust(h, { reason: '  Taille  ' });

    expect(h.orders[0].lines[0]).toEqual(
      expect.objectContaining({ quantity: 2, cancelledQty: 1 }),
    );
    expect(h.orders[0].totalCents).toBe(2000);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 4, available: 4 }));
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.RETURN,
        onHandDelta: 1,
        availableDelta: 1,
        orderId: 'order-1',
        orderLineId: 'line-1',
        userId: 'u-admin',
        reason: 'Retour client : Taille',
      }),
    ]);
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-1',
        amountCents: -2000,
        method: ClubPaymentMethod.MANUAL_CASH,
        refundedPaymentId: 'pay-1',
        financialAccountId: 'fa-caisse',
      }),
    ]);
    expect(h.creditNotesOf()).toEqual([
      expect.objectContaining({
        parentInvoiceId: 'inv-1',
        amountCents: 2000,
        creditNoteReason: 'Article annulé — Taille',
      }),
    ]);
    expect(h.adjustments).toEqual([
      expect.objectContaining({
        clubId: 'club-1',
        orderId: 'order-1',
        kind: ShopOrderAdjustmentKind.LINE_CANCEL,
        reason: 'Taille',
        userId: 'u-admin',
        returnedLineId: 'line-1',
        returnedQty: 1,
        returnedLabel: 'T-shirt — L',
        returnedUnitPriceCents: 2000,
        goodsLost: false,
        newLineId: null,
        differenceCents: -2000,
        refundedCents: 2000,
        cardRefundCents: 0,
        writtenOffCents: 0,
        wasDelivered: false,
        signerName: null,
        signedAt: null,
      }),
    ]);
    expect(h.events).toEqual(['commit', 'accounting', 'allocate']);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
    expect(res).toEqual(
      expect.objectContaining({
        adjustmentId: h.adjustments[0].id,
        cardRefunds: [],
        manualRefundedCents: 2000,
        chequesReturned: 0,
        writtenOffCents: 0,
        supplementInvoiceId: null,
        supplementCents: 0,
        signed: false,
      }),
    );
    expect(res.order).toEqual(
      expect.objectContaining({ totalCents: 2000, amountDueCents: 0, payableOnline: false }),
    );
    expect(res.order.adjustments).toEqual([
      expect.objectContaining({
        kind: ShopOrderAdjustmentKind.LINE_CANCEL,
        returnedQty: 1,
        differenceCents: -2000,
        refundedCents: 2000,
        signed: false,
      }),
    ]);
    // Une annulation n'a pas de bon d'échange.
    await expect(h.shop.getExchangeNote('club-1', res.adjustmentId)).resolves.toBeNull();
  });

  it('en attente, rien d’encaissé : la réservation est libérée, la part éteinte, la session fermée', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    const res = await adjust(h);

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 4 }));
    expect(h.movements).toEqual([
      expect.objectContaining({ kind: ShopStockMovementKind.RELEASE, availableDelta: 1 }),
    ]);
    expect(h.payments).toHaveLength(0);
    expect(h.creditNotesOf()).toEqual([
      expect.objectContaining({
        parentInvoiceId: 'inv-1',
        amountCents: 2000,
        creditNoteReason: 'Article annulé — Taille',
      }),
    ]);
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
    // Rien d'encaissé : ni contre-passation ni échéancier. La session, elle,
    // demanderait encore 40 € : elle est fermée.
    expect(h.events).toEqual(['commit', 'expire', 'allocate']);
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).toHaveBeenCalledWith(
      'club-1',
      'inv-1',
    );
    expect(res.writtenOffCents).toBe(2000);
    expect(res.order).toEqual(
      expect.objectContaining({ amountDueCents: 2000, payableOnline: true }),
    );
  });

  it('acompte au-delà du nouveau total : trop-perçu rendu, reste éteint, commande réglée et sortie du stock', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
      payments: [PAYMENT({ amountCents: 3000 })],
    });

    const res = await adjust(h);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.orders[0].fulfilledAt).toBeInstanceOf(Date);
    // Une libérée, l'autre remise au paiement.
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 4, available: 4 }));
    expect(h.movements.map((m) => [m.kind, m.onHandDelta, m.availableDelta])).toEqual([
      [ShopStockMovementKind.RELEASE, 0, 1],
      [ShopStockMovementKind.FULFILL, -1, 0],
    ]);
    expect(h.invoices[0].status).toBe(InvoiceStatus.PAID);
    expect(h.refundsOf().map((p) => p.amountCents)).toEqual([-1000]);
    expect(h.creditNotesOf().map((c) => c.amountCents)).toEqual([1000, 1000]);
    expect(h.events).toEqual(['commit', 'accounting', 'schedule', 'expire', 'allocate']);
    expect(h.scheduleEngine.closeScheduleForInvoice).toHaveBeenCalledWith(
      'inv-1',
      InvoiceStatus.PAID,
    );
    expect(res.order).toEqual(
      expect.objectContaining({
        status: ShopOrderStatus.PAID,
        amountDueCents: 0,
        payableOnline: false,
      }),
    );
  });

  it('commande sans facture, antérieure à la facturation : l’article est retiré, aucun argent ne bouge', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
    });

    const res = await adjust(h);

    expect(h.orders[0].lines[0].cancelledQty).toBe(1);
    expect(h.orders[0].totalCents).toBe(2000);
    expect(h.variants[0].available).toBe(4);
    expect(h.invoices).toHaveLength(0);
    expect(h.payments).toHaveLength(0);
    expect(h.events).toEqual(['commit', 'allocate']);
    expect(res.order).toEqual(
      expect.objectContaining({ invoiceId: null, amountDueCents: 0, payableOnline: false }),
    );
  });

  it('part d’un chèque en portefeuille : reversée par virement depuis la banque du club, le chèque reste à remettre', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [
        PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK, financialAccountId: 'fa-cheques' }),
      ],
      cheques: [CHEQUE()],
    });

    const res = await adjust(h);

    expect(h.cheques[0]).toEqual(
      expect.objectContaining({ status: ChequeStatus.PENDING, notes: null }),
    );
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        amountCents: -2000,
        method: ClubPaymentMethod.MANUAL_TRANSFER,
        refundedPaymentId: 'pay-1',
        financialAccountId: 'fa-banque-club',
      }),
    ]);
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      h.creditNotesOf()[0].id,
      'pay-1',
      'fa-banque-club',
    );
    expect(res.chequesReturned).toBe(0);
    expect(res.manualRefundedCents).toBe(2000);
  });

  it('part d’un chèque sans banque par défaut : refus et rollback', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK })],
      cheques: [CHEQUE()],
      clubBankId: null,
    });

    await expect(adjust(h)).rejects.toThrow(/Aucun compte bancaire par défaut/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].lines[0].cancelledQty).toBe(0);
    expect(h.orders[0].totalCents).toBe(4000);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 3, available: 3 }));
    expect(h.movements).toHaveLength(0);
    expect(h.payments).toHaveLength(1);
    expect(h.adjustments).toHaveLength(0);
  });
});

describe('adjust — échanger', () => {
  it('contre un article plus cher : l’article pris sort, la différence est facturée à part', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT(), KIMONO()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    const res = await adjust(h, { newVariantId: 'v-2' });

    const pris = takenLine(h);
    expect(pris).toEqual(
      expect.objectContaining({
        productId: 'p-2',
        variantId: 'v-2',
        quantity: 1,
        unitPriceCents: 3500,
        label: 'Kimono — 140',
        awaitingStockQty: 0,
        cancelledQty: 0,
      }),
    );
    expect(h.orders[0].lines[0].cancelledQty).toBe(1);
    expect(h.orders[0].totalCents).toBe(5500);
    expect(h.movements.map((m) => [m.kind, m.variantId, m.orderLineId])).toEqual([
      [ShopStockMovementKind.RETURN, 'v-1', 'line-1'],
      [ShopStockMovementKind.RESERVE, 'v-2', pris.id],
      [ShopStockMovementKind.FULFILL, 'v-2', pris.id],
    ]);
    expect(h.variants.map((v) => [v.id, v.onHand, v.available])).toEqual([
      ['v-1', 4, 4],
      ['v-2', 3, 3],
    ]);
    // Aucun argent rendu : seule la différence est due, sur une facture à part.
    expect(h.refundsOf()).toHaveLength(0);
    expect(h.creditNotesOf()).toHaveLength(0);
    const reste = h.invoices.find((i) => i.shopAdjustmentId === res.adjustmentId);
    expect(reste).toEqual(
      expect.objectContaining({
        id: res.supplementInvoiceId,
        clubId: 'club-1',
        shopOrderId: null,
        familyId: 'fam-1',
        label: 'Échange boutique — reste à payer — Camille MARTIN',
        baseAmountCents: 1500,
        amountCents: 1500,
        status: InvoiceStatus.OPEN,
      }),
    );
    expect(h.adjustments).toEqual([
      expect.objectContaining({
        kind: ShopOrderAdjustmentKind.EXCHANGE,
        newLineId: pris.id,
        newQty: 1,
        newLabel: 'Kimono — 140',
        newUnitPriceCents: 3500,
        differenceCents: 1500,
        refundedCents: 0,
        writtenOffCents: 0,
      }),
    ]);
    expect(h.events).toEqual(['commit', 'allocate']);
    expect(res).toEqual(
      expect.objectContaining({ supplementCents: 1500, signed: false, cardRefunds: [] }),
    );
    expect(res.order).toEqual(
      expect.objectContaining({ totalCents: 5500, amountDueCents: 1500, payableOnline: true }),
    );
    expect(res.order.adjustments).toEqual([
      expect.objectContaining({
        kind: ShopOrderAdjustmentKind.EXCHANGE,
        newLabel: 'Kimono — 140',
        supplementInvoiceId: res.supplementInvoiceId,
        supplementInvoiceStatus: InvoiceStatus.OPEN,
      }),
    ]);
  });

  it('contre un article moins cher payé par carte : seule la différence est remboursée, après le commit', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      products: [PRODUCT(), PRODUCT({ id: 'p-3', name: 'Débardeur', priceCents: 1200 })],
      variants: [
        VARIANT(),
        VARIANT({ id: 'v-3', productId: 'p-3', label: 'S', onHand: 2, available: 2 }),
      ],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.STRIPE_CARD, externalRef: 'pi_1' })],
    });

    const res = await adjust(h, { newVariantId: 'v-3', reason: 'Préfère un débardeur' });

    expect(h.orders[0].totalCents).toBe(3200);
    // Le paiement négatif et l'avoir arriveront par le webhook (ADR-0011).
    expect(h.refundsOf()).toHaveLength(0);
    expect(h.stripeRefunds.refundPayment).toHaveBeenCalledWith({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: 800,
      reason: 'Préfère un débardeur',
    });
    expect(h.adjustments[0]).toEqual(
      expect.objectContaining({ refundedCents: 0, cardRefundCents: 800, differenceCents: -800 }),
    );
    expect(h.events).toEqual(['commit', 'stripe', 'allocate']);
    expect(res.cardRefunds).toEqual([
      { paymentId: 'pay-1', amountCents: 800, ok: true, error: null },
    ]);
    expect(res.manualRefundedCents).toBe(0);
    expect(res.order.adjustments[0].refundedCents).toBe(800);
  });

  it('article défectueux déclaré perdu, remplacé à l’identique : aucun argent ne bouge', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    const res = await adjust(h, {
      newVariantId: 'v-1',
      goodsLost: true,
      reason: 'Couture défaite',
    });

    // Rendu (+1), déclaré perdu (−1), remplacé (−1) : un de moins au placard.
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 2, available: 2 }));
    expect(h.movements.map((m) => m.kind)).toEqual([
      ShopStockMovementKind.RETURN,
      ShopStockMovementKind.SHRINKAGE,
      ShopStockMovementKind.RESERVE,
      ShopStockMovementKind.FULFILL,
    ]);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', []);
    expect(h.payments).toHaveLength(1);
    expect(h.invoices).toHaveLength(1);
    expect(res.supplementCents).toBe(0);
    expect(h.events).toEqual(['commit', 'allocate']);
  });

  it('précommande : l’article pris, épuisé, attend l’arrivage sans rien réserver', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      products: [
        PRODUCT(),
        PRODUCT({ id: 'p-2', name: 'Kimono', priceCents: 3500, preorderEnabled: true }),
      ],
      variants: [VARIANT({ onHand: 5, available: 3 }), KIMONO({ onHand: 0, available: 0 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    const res = await adjust(h, { newVariantId: 'v-2' });

    expect(takenLine(h).awaitingStockQty).toBe(1);
    expect(h.variants[1]).toEqual(expect.objectContaining({ onHand: 0, available: 0 }));
    expect(h.movements.map((m) => [m.kind, m.variantId])).toEqual([
      [ShopStockMovementKind.RELEASE, 'v-1'],
    ]);
    expect(res.order).toEqual(
      expect.objectContaining({ totalCents: 5500, amountDueCents: 5500 }),
    );
  });

  it('annuler l’article pris : le reste à payer jamais réglé est annulé, le trop-perçu rendu', async () => {
    const h = makeWorld({
      orders: [
        ORDER({
          totalCents: 5500,
          lines: [
            LINE({ cancelledQty: 1 }),
            LINE({
              id: 'line-2',
              productId: 'p-2',
              variantId: 'v-2',
              label: 'Kimono — 140',
              quantity: 1,
              unitPriceCents: 3500,
              createdAt: T1,
            }),
          ],
        }),
      ],
      variants: [VARIANT({ onHand: 4, available: 4 }), KIMONO({ onHand: 3, available: 3 })],
      invoices: [INVOICE(), SUPPLEMENT()],
      payments: [PAYMENT()],
      adjustments: [ADJUSTMENT()],
    });

    const res = await adjust(h, { lineId: 'line-2', reason: 'Finalement non' });

    expect(h.orders[0].totalCents).toBe(2000);
    expect(h.variants[1]).toEqual(expect.objectContaining({ onHand: 4, available: 4 }));
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({ invoiceId: 'inv-1', amountCents: -2000 }),
    ]);
    expect(h.invoices.find((i) => i.id === 'inv-sup')).toEqual(
      expect.objectContaining({
        status: InvoiceStatus.VOID,
        voidReason: 'Article annulé : Finalement non',
      }),
    );
    expect(h.events).toEqual(['commit', 'accounting', 'schedule', 'expire', 'allocate']);
    expect(h.scheduleEngine.closeScheduleForInvoice).toHaveBeenCalledWith(
      'inv-sup',
      InvoiceStatus.VOID,
    );
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).toHaveBeenCalledWith(
      'club-1',
      'inv-sup',
    );
    expect(res.order.amountDueCents).toBe(0);
    expect(res.order.adjustments.map((a) => [a.kind, a.supplementInvoiceStatus])).toEqual([
      [ShopOrderAdjustmentKind.EXCHANGE, InvoiceStatus.VOID],
      [ShopOrderAdjustmentKind.LINE_CANCEL, null],
    ]);
  });
});

describe('adjust — l’échange d’une commande remise se signe', () => {
  /** Remise avant les lignes figées : son bon lit encore la commande. */
  const REMISE = () =>
    ORDER({
      deliveredAt: T0,
      deliveredByUserId: 'u-admin',
      deliverySignerName: 'Camille MARTIN',
      deliverySignaturePng: PNG,
    });
  const monde = () =>
    makeWorld({
      orders: [REMISE()],
      variants: [VARIANT(), KIMONO()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

  it('sans l’article rapporté : refus avant toute transaction', async () => {
    const h = monde();

    await expect(adjust(h, { newVariantId: 'v-2' })).rejects.toThrow(/rapporter l’article/);

    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it('sans signature : refus avant toute transaction', async () => {
    const h = monde();

    await expect(
      adjust(h, { newVariantId: 'v-2', goodsReturned: true }),
    ).rejects.toThrow(BadRequestException);

    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it('signature qui n’est pas un PNG : refus et rollback', async () => {
    const h = monde();

    await expect(
      adjust(h, {
        newVariantId: 'v-2',
        goodsReturned: true,
        signerName: 'Camille MARTIN',
        signaturePng: 'data:image/jpeg;base64,AAAA',
      }),
    ).rejects.toThrow(/Signature illisible/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].lines).toHaveLength(1);
    expect(h.adjustments).toHaveLength(0);
  });

  it('signé : le bon de livraison reste tel que signé, et le bon d’échange existe', async () => {
    const h = monde();

    const res = await adjust(h, {
      newVariantId: 'v-2',
      goodsReturned: true,
      signerName: '  Camille MARTIN ',
      signaturePng: PNG,
    });

    expect(res.signed).toBe(true);
    expect(h.adjustments[0]).toEqual(
      expect.objectContaining({
        wasDelivered: true,
        signerName: 'Camille MARTIN',
        signaturePng: PNG,
      }),
    );
    expect(h.adjustments[0].signedAt).toBeInstanceOf(Date);
    // Ce que la première signature atteste, figé avant que la ligne change.
    const remis = { label: 'T-shirt — L', quantity: 2, unitPriceCents: 2000 };
    expect(h.orders[0].deliveredLines).toEqual({ lines: [remis], totalCents: 4000 });
    const livraison = await h.shop.getDeliveryNote('club-1', 'order-1');
    expect(livraison!.order.lines).toEqual([remis]);
    expect(livraison!.order.totalCents).toBe(4000);

    const bon = await h.shop.getExchangeNote('club-1', res.adjustmentId);
    expect(bon).toEqual({
      club: { name: 'Dojo Test', siret: null, address: '1 rue du Dojo' },
      order: { reference: 'CMD-ORDER-1', createdAt: T0 },
      exchange: {
        reference: `ECH-${res.adjustmentId.slice(0, 8).toUpperCase()}`,
        at: h.adjustments[0].signedAt,
        reason: 'Taille',
        returned: { quantity: 1, label: 'T-shirt — L', unitPriceCents: 2000 },
        taken: { quantity: 1, label: 'Kimono — 140', unitPriceCents: 3500 },
        differenceCents: 1500,
        refundedCents: 0,
        writtenOffCents: 0,
      },
      buyerName: 'Camille MARTIN',
      signature: { signerName: 'Camille MARTIN', signaturePng: expect.anything() },
    });
    expect(bon!.signature.signaturePng.subarray(1, 4).toString('ascii')).toBe('PNG');
    await expect(h.shop.getExchangeNote('club-2', res.adjustmentId)).resolves.toBeNull();
  });

  it('un second échange ne réécrit pas les lignes déjà figées', async () => {
    const remis = { label: 'T-shirt — L', quantity: 2, unitPriceCents: 2000 };
    const h = makeWorld({
      orders: [
        ORDER({
          deliveredAt: T0,
          deliverySignerName: 'Camille MARTIN',
          deliverySignaturePng: PNG,
          deliveredLines: { lines: [remis], totalCents: 4000 },
          totalCents: 5500,
          lines: [
            LINE({ cancelledQty: 1 }),
            LINE({
              id: 'line-2',
              productId: 'p-2',
              variantId: 'v-2',
              label: 'Kimono — 140',
              quantity: 1,
              unitPriceCents: 3500,
              createdAt: T1,
            }),
          ],
        }),
      ],
      variants: [VARIANT(), KIMONO()],
      invoices: [INVOICE(), SUPPLEMENT({ status: InvoiceStatus.PAID })],
      payments: [
        PAYMENT(),
        PAYMENT({ id: 'pay-sup', invoiceId: 'inv-sup', amountCents: 1500, createdAt: T1 }),
      ],
      adjustments: [
        ADJUSTMENT({
          wasDelivered: true,
          signerName: 'Camille MARTIN',
          signaturePng: PNG,
          signedAt: T1,
        }),
      ],
    });

    await adjust(h, {
      lineId: 'line-2',
      newVariantId: 'v-1',
      goodsReturned: true,
      signerName: 'Camille MARTIN',
      signaturePng: PNG,
    });

    expect(h.orders[0].deliveredLines).toEqual({ lines: [remis], totalCents: 4000 });
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({ invoiceId: 'inv-sup', amountCents: -1500 }),
    ]);
  });
});

describe('adjust — refus, sans rien écrire', () => {
  it('dernier article de la commande : refus avant toute transaction', async () => {
    const h = makeWorld({
      orders: [ORDER({ totalCents: 2000, lines: [LINE({ quantity: 1 })] })],
      variants: [VARIANT()],
      invoices: [INVOICE({ amountCents: 2000 })],
      payments: [PAYMENT({ amountCents: 2000 })],
    });

    await expect(adjust(h)).rejects.toThrow(/dernier article/);

    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it('motif vide : refus avant toute lecture', async () => {
    const h = makeWorld({ orders: [ORDER()], variants: [VARIANT()] });

    await expect(adjust(h, { reason: '   ' })).rejects.toThrow(BadRequestException);

    expect(h.db.shopOrder.findFirst).not.toHaveBeenCalled();
  });

  it('commande d’un AUTRE club : introuvable, en aperçu comme en ajustement', async () => {
    const h = makeWorld({
      orders: [ORDER({ clubId: 'club-2' })],
      variants: [VARIANT({ clubId: 'club-2' })],
    });
    const input = { orderId: 'order-1', lineId: 'line-1', quantity: 1 };

    await expect(h.adjust.preview('club-1', input)).rejects.toThrow(NotFoundException);
    await expect(adjust(h)).rejects.toThrow(NotFoundException);

    expect(h.orders[0].lines[0].cancelledQty).toBe(0);
  });

  it('ligne étrangère à la commande : introuvable', async () => {
    const h = makeWorld({ orders: [ORDER()], variants: [VARIANT()] });

    await expect(adjust(h, { lineId: 'line-autre' })).rejects.toThrow(/Article introuvable/);
  });
});

describe('adjust — un geste concurrent entre l’aperçu et la confirmation', () => {
  it('article ajusté entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [ORDER({ totalCents: 6000, lines: [LINE({ quantity: 3 })] })],
      variants: [VARIANT()],
      invoices: [INVOICE({ amountCents: 6000 })],
      payments: [PAYMENT({ amountCents: 6000 })],
    });
    h.meanwhile(() => {
      h.orders[0].lines[0].cancelledQty = 1;
    });

    await expect(adjust(h)).rejects.toThrow(/Cet article vient de changer/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].lines[0].cancelledQty).toBe(1);
    expect(h.movements).toHaveLength(0);
    expect(h.payments).toHaveLength(1);
  });

  it('prix de l’article pris changé entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT(), KIMONO()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });
    h.meanwhile(() => {
      h.products[1].priceCents = 3900;
    });

    await expect(adjust(h, { newVariantId: 'v-2' })).rejects.toThrow(
      /prix du nouvel article vient de changer/,
    );

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].lines).toHaveLength(1);
    expect(h.orders[0].lines[0].cancelledQty).toBe(0);
    expect(h.variants.map((v) => [v.onHand, v.available])).toEqual([
      [3, 3],
      [4, 4],
    ]);
    expect(h.movements).toHaveLength(0);
  });

  it('règlement enregistré entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.meanwhile(() => h.payments.push(PAYMENT({ id: 'pay-tardif', amountCents: 1000 })));

    await expect(adjust(h)).rejects.toThrow(/règlement vient d’être enregistré/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].lines[0].cancelledQty).toBe(0);
    expect(h.variants[0].available).toBe(3);
    expect(h.creditNotesOf()).toHaveLength(0);
    expect(h.adjustments).toHaveLength(0);
  });

  it('commande remise entre-temps : le plan ne vaut plus, rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });
    h.meanwhile(() => {
      h.orders[0].deliveredAt = T0;
    });

    await expect(adjust(h)).rejects.toThrow(/Cette commande vient de changer/);

    expect(h.events).toEqual(['rollback']);
    expect(h.refundsOf()).toHaveLength(0);
    expect(h.movements).toHaveLength(0);
  });
});

describe('preview — le plan, sans rien écrire', () => {
  it('dit ce que ferait l’annulation d’un article payé par chèque', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK })],
      cheques: [CHEQUE()],
    });

    await expect(
      h.adjust.preview('club-1', { orderId: 'order-1', lineId: 'line-1', quantity: 1 }),
    ).resolves.toEqual({
      blockers: [],
      delivered: false,
      exited: true,
      signatureRequired: false,
      removedCents: 2000,
      addedCents: 0,
      differenceCents: -2000,
      fromAwaiting: 0,
      releaseUnits: 0,
      returnUnits: 1,
      newItemLabel: null,
      newItemUnitPriceCents: null,
      newItemAwaitingUnits: null,
      supplementCents: 0,
      refunds: [
        { kind: 'CHEQUE_PARTIAL', paymentId: 'pay-1', amountCents: 2000, chequeNumber: '0012' },
      ],
      refundCents: 2000,
      writeOffCents: 0,
      invoiceVoided: false,
      settlesOrder: false,
    });

    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.cheques[0].status).toBe(ChequeStatus.PENDING);
    expect(h.orders[0].lines[0].cancelledQty).toBe(0);
  });
});

describe('après le commit — un effet accessoire qui échoue ne défait rien', () => {
  it('la session qui ne se ferme pas : l’ajustement tient, et l’échec se dit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.stripeCheckout.expireCheckoutSessionForInvoice.mockRejectedValueOnce(
      new Error('Stripe indisponible'),
    );
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      const res = await adjust(h);
      expect(res.writtenOffCents).toBe(2000);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/PAYABLE/));
    } finally {
      error.mockRestore();
    }

    expect(h.adjustments).toHaveLength(1);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
  });
});
