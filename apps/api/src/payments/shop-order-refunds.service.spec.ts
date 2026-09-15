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
  SUPPLEMENT,
  T0,
  T1,
  VARIANT,
  makeWorld,
  type WorldCheque,
} from '../../test/shop-order-world';

/**
 * « Annuler et rembourser » (ADR-0019), de bout en bout, y compris les factures
 * du reste à payer d'un échange (ADR-0020) : le vrai `ShopService`, le vrai
 * moteur de stock, le vrai service d'avoirs et `ShopOrderMoneyService`, sur le
 * double de PostgreSQL de `test/shop-order-world.ts` — qui applique chaque
 * clause des `where`, lève sur celles qu'il ne sait pas simuler et fait un
 * ROLLBACK réel.
 */

describe('cancelAndRefund — chaque règlement rendu par son moyen', () => {
  it('en attente, sans règlement : libère le stock, annule la facture et ferme sa session', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: '  Taille indisponible  ',
    });

    expect(h.orders[0]).toEqual(
      expect.objectContaining({
        status: ShopOrderStatus.CANCELLED,
        cancelReason: 'Taille indisponible',
        cancelledByUserId: 'u-admin',
      }),
    );
    expect(h.orders[0].cancelledAt).toBeInstanceOf(Date);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(h.movements.map((m) => m.kind)).toEqual([ShopStockMovementKind.RELEASE]);
    expect(h.invoices[0]).toEqual(
      expect.objectContaining({
        status: InvoiceStatus.VOID,
        voidReason: 'Commande annulée : Taille indisponible',
      }),
    );
    expect(h.creditNotesOf()).toHaveLength(0);
    expect(h.payments).toHaveLength(0);
    // Après le commit : l'échéancier, la session de paiement, les précommandes.
    expect(h.events).toEqual(['commit', 'schedule', 'expire', 'allocate']);
    expect(h.scheduleEngine.closeScheduleForInvoice).toHaveBeenCalledWith(
      'inv-1',
      InvoiceStatus.VOID,
    );
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).toHaveBeenCalledWith(
      'club-1',
      'inv-1',
    );
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
    expect(res).toEqual(
      expect.objectContaining({
        cardRefunds: [],
        manualRefundedCents: 0,
        chequesReturned: 0,
        writtenOffCents: 0,
        invoiceVoided: true,
      }),
    );
    expect(res.order).toEqual(
      expect.objectContaining({
        id: 'order-1',
        status: ShopOrderStatus.CANCELLED,
        cancelReason: 'Taille indisponible',
        invoiceStatus: InvoiceStatus.VOID,
        amountDueCents: 0,
        payableOnline: false,
      }),
    );
  });

  it('payée par le crédit : le crédit est rendu, sans compte, et sa contre-passation désigne l’imputation', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.PAYER_CREDIT, financialAccountId: null })],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Erreur de taille',
    });

    // Aucun argent ne sort : un paiement négatif PAYER_CREDIT rend le crédit
    // à la même personne (ADR-0022).
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-1',
        amountCents: -4000,
        method: ClubPaymentMethod.PAYER_CREDIT,
        refundedPaymentId: 'pay-1',
        financialAccountId: null,
        paidByMemberId: 'm-1',
      }),
    ]);
    expect(h.creditNotesOf()).toEqual([
      expect.objectContaining({ parentInvoiceId: 'inv-1', amountCents: 4000 }),
    ]);
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      h.creditNotesOf()[0].id,
      'pay-1',
      null,
      undefined,
    );
    expect(res.manualRefundedCents).toBe(4000);
  });

  it('payée en espèces : rend l’argent et reprend les articles en stock', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Erreur de taille',
    });

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.RETURN,
        onHandDelta: 2,
        availableDelta: 2,
        orderId: 'order-1',
        orderLineId: 'line-1',
        userId: 'u-admin',
      }),
    ]);
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-1',
        amountCents: -4000,
        method: ClubPaymentMethod.MANUAL_CASH,
        refundedPaymentId: 'pay-1',
        financialAccountId: 'fa-caisse',
        paidByMemberId: 'm-1',
      }),
    ]);
    const avoirs = h.creditNotesOf();
    expect(avoirs).toEqual([
      expect.objectContaining({
        parentInvoiceId: 'inv-1',
        amountCents: 4000,
        creditNoteReason: 'Remboursement — Erreur de taille',
        familyId: 'fam-1',
      }),
    ]);
    // La facture garde son statut : les avoirs portent l'annulation (ADR-0011).
    expect(h.invoices[0].status).toBe(InvoiceStatus.PAID);
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      avoirs[0].id,
      'pay-1',
      null,
      undefined,
    );
    expect(h.events).toEqual(['commit', 'accounting', 'schedule', 'allocate']);
    expect(h.stripeRefunds.refundPayment).not.toHaveBeenCalled();
    expect(res).toEqual(
      expect.objectContaining({ manualRefundedCents: 4000, invoiceVoided: false }),
    );
  });

  it('acompte en espèces : rend l’acompte et éteint le reste dû par un avoir', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
      payments: [PAYMENT({ amountCents: 1500 })],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Désistement',
    });

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(h.refundsOf().map((p) => p.amountCents)).toEqual([-1500]);
    expect(h.creditNotesOf().map((a) => [a.amountCents, a.creditNoteReason])).toEqual([
      [1500, 'Remboursement — Désistement'],
      [2500, 'Annulation de la commande — Désistement'],
    ]);
    // Seul l'argent rendu se contre-passe : le reste dû n'a jamais été encaissé.
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledTimes(1);
    // Une facture qui porte un paiement ne s'annule jamais.
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).toHaveBeenCalledWith(
      'club-1',
      'inv-1',
    );
    expect(res.writtenOffCents).toBe(2500);
  });

  it('chèque en portefeuille : rendu à l’adhérent, contre-passé sur son compte', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [
        PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK, financialAccountId: 'fa-cheques' }),
      ],
      cheques: [CHEQUE()],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Doublon',
    });

    expect(h.cheques[0]).toEqual(
      expect.objectContaining({
        status: ChequeStatus.CANCELLED,
        notes: 'Rendu à l’adhérent : commande annulée — Doublon',
      }),
    );
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        method: ClubPaymentMethod.MANUAL_CHECK,
        financialAccountId: 'fa-cheques',
        amountCents: -4000,
      }),
    ]);
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      h.creditNotesOf()[0].id,
      'pay-1',
      null,
      undefined,
    );
    expect(res.chequesReturned).toBe(1);
  });

  it('chèque déjà remis : remboursé par virement depuis la banque de sa remise', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [
        PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK, financialAccountId: 'fa-cheques' }),
      ],
      cheques: [CHEQUE({ status: ChequeStatus.DEPOSITED, depositId: 'dep-1' })],
      deposits: [{ id: 'dep-1', financialAccountId: 'fa-banque' }],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Doublon',
    });

    expect(h.cheques[0].status).toBe(ChequeStatus.DEPOSITED);
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        method: ClubPaymentMethod.MANUAL_TRANSFER,
        financialAccountId: 'fa-banque',
        refundedPaymentId: 'pay-1',
      }),
    ]);
    // 511200 a été soldé à la remise : la sortie part de la banque.
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      h.creditNotesOf()[0].id,
      'pay-1',
      'fa-banque',
      undefined,
    );
    expect(res.chequesReturned).toBe(0);
  });

  it('carte : remboursée par Stripe APRÈS le commit, sans écriture locale', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [
        PAYMENT({
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: 'pi_123',
          financialAccountId: 'fa-transit',
        }),
      ],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Rupture fournisseur',
    });

    // Le paiement négatif et l'avoir arrivent par le webhook (ADR-0011).
    expect(h.refundsOf()).toHaveLength(0);
    expect(h.creditNotesOf()).toHaveLength(0);
    // Le montant est explicite : c'est ce qui permet de ne rendre qu'une part
    // à l'échange (ADR-0020).
    expect(h.stripeRefunds.refundPayment).toHaveBeenCalledWith({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: 4000,
      reason: 'Rupture fournisseur',
    });
    expect(h.events).toEqual(['commit', 'stripe', 'schedule', 'allocate']);
    expect(res.cardRefunds).toEqual([
      { paymentId: 'pay-1', amountCents: 4000, ok: true, error: null },
    ]);
    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
  });

  it('carte refusée par Stripe : la commande reste annulée, et l’échec est rendu', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.STRIPE_CARD, externalRef: 'pi_123' })],
    });
    h.stripeRefunds.refundPayment.mockRejectedValueOnce(new Error('charge_disputed'));
    const journal = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    let res!: Awaited<ReturnType<typeof h.refunds.cancelAndRefund>>;
    try {
      res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
        orderId: 'order-1',
        reason: 'Rupture fournisseur',
      });
    } finally {
      journal.mockRestore();
    }

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(res.cardRefunds).toEqual([
      { paymentId: 'pay-1', amountCents: 4000, ok: false, error: 'charge_disputed' },
    ]);
  });

  it('commande remise : exige les articles rapportés, puis remise en vente ou perte par ligne', async () => {
    const h = makeWorld({
      orders: [
        ORDER({
          deliveredAt: T0,
          lines: [
            LINE(),
            LINE({ id: 'line-2', variantId: 'v-2', label: 'Short — M', quantity: 1 }),
          ],
        }),
      ],
      variants: [VARIANT(), VARIANT({ id: 'v-2', onHand: 1, available: 1 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/rapporter les articles/);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.payments).toHaveLength(1);
    expect(h.movements).toHaveLength(0);

    await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Taille',
      goodsReturned: true,
      lostLineIds: ['line-2'],
    });

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    // Revenu, puis déclaré perdu : ni au placard, ni vendable.
    expect(h.variants[1]).toEqual(expect.objectContaining({ onHand: 1, available: 1 }));
    expect(h.movements.map((m) => [m.kind, m.orderLineId])).toEqual([
      [ShopStockMovementKind.RETURN, 'line-1'],
      [ShopStockMovementKind.RETURN, 'line-2'],
      [ShopStockMovementKind.SHRINKAGE, 'line-2'],
    ]);
    expect(h.movements[2]).toEqual(
      expect.objectContaining({ reason: 'Article rendu déclaré perdu : Taille', orderId: 'order-1' }),
    );
    // Seul l'article remis en vente sert les précommandes.
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
  });
});

describe('cancelAndRefund — refus, sans rien écrire', () => {
  it('prélèvement d’échéance en cours : refus avant toute transaction', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });
    h.scheduleEngine.sumInFlightForInvoice.mockResolvedValueOnce(1300);

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/prélèvement/);

    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.stripeRefunds.refundPayment).not.toHaveBeenCalled();
  });

  it('commande déjà annulée : refus avant toute transaction', async () => {
    const h = makeWorld({
      orders: [PENDING({ status: ShopOrderStatus.CANCELLED })],
      variants: [VARIANT()],
      invoices: [INVOICE({ status: InvoiceStatus.VOID })],
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/déjà annulée/);

    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.movements).toHaveLength(0);
  });

  it('commande d’un AUTRE club : introuvable, en aperçu comme en annulation', async () => {
    const h = makeWorld({
      orders: [ORDER({ clubId: 'club-2' })],
      variants: [VARIANT({ clubId: 'club-2' })],
      invoices: [INVOICE({ clubId: 'club-2' })],
      payments: [PAYMENT({ clubId: 'club-2' })],
    });

    await expect(h.refunds.preview('club-1', 'order-1')).rejects.toThrow(NotFoundException);
    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(NotFoundException);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
  });

  it('motif vide : refus avant toute lecture', async () => {
    const h = makeWorld({ orders: [ORDER()], variants: [VARIANT()] });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: '   ' }),
    ).rejects.toThrow(BadRequestException);

    expect(h.db.shopOrder.findFirst).not.toHaveBeenCalled();
  });

  it('article perdu sur une commande dont rien n’est sorti : refus et rollback', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', {
        orderId: 'order-1',
        reason: 'Taille',
        lostLineIds: ['line-1'],
      }),
    ).rejects.toThrow(/aucun article ne peut être déclaré perdu/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 3 }));
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
  });

  it('ligne déclarée perdue étrangère à la commande : refus et rollback', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', {
        orderId: 'order-1',
        reason: 'Taille',
        lostLineIds: ['line-autre'],
      }),
    ).rejects.toThrow(/n’appartient pas à cette commande/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.payments).toHaveLength(1);
  });
});

describe('cancelAndRefund — un geste concurrent entre l’aperçu et la confirmation', () => {
  it('chèque remis en banque entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK })],
      cheques: [CHEQUE()],
    });
    h.meanwhile(() =>
      Object.assign(h.cheques[0], { status: ChequeStatus.DEPOSITED, depositId: 'dep-1' }),
    );

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Doublon' }),
    ).rejects.toThrow(/vient d’être remis en banque/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 3, available: 3 }));
    expect(h.movements).toHaveLength(0);
    expect(h.payments).toHaveLength(1);
    expect(h.creditNotesOf()).toHaveLength(0);
  });

  it('règlement enregistré entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.meanwhile(() => h.payments.push(PAYMENT({ id: 'pay-tardif', amountCents: 1000 })));

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/règlement vient d’être enregistré/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
  });

  it('avoir émis entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
      payments: [PAYMENT({ amountCents: 1500 })],
    });
    h.meanwhile(() =>
      h.invoices.push(
        INVOICE({
          id: 'cn-manuel',
          shopOrderId: null,
          isCreditNote: true,
          parentInvoiceId: 'inv-1',
          amountCents: 2500,
        }),
      ),
    );

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/avoir vient d’être émis/);

    expect(h.events).toEqual(['rollback']);
    expect(h.refundsOf()).toHaveLength(0);
    expect(h.creditNotesOf().map((a) => a.id)).toEqual(['cn-manuel']);
  });

  it('commande remise entre-temps : le plan ne vaut plus, rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.meanwhile(() => Object.assign(h.orders[0], { fulfilledAt: T0, deliveredAt: T0 }));

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', {
        orderId: 'order-1',
        reason: 'Taille',
        goodsReturned: true,
      }),
    ).rejects.toThrow(/vient de changer/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
  });

  it('commande annulée entre-temps : le dit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.meanwhile(() => {
      h.orders[0].status = ShopOrderStatus.CANCELLED;
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/déjà annulée/);

    expect(h.events).toEqual(['rollback']);
    expect(h.variants[0].available).toBe(3);
  });

  it('reste à payer d’un échange émis entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });
    h.meanwhile(() => {
      h.adjustments.push(ADJUSTMENT());
      h.invoices.push(SUPPLEMENT());
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/facture vient d’être émise/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.payments).toHaveLength(1);
    expect(h.movements).toHaveLength(0);
  });
});

describe('cancelAndRefund — la marchandise', () => {
  it('précommande payée : ne reprend que les unités servies, l’attente s’éteint', async () => {
    const h = makeWorld({
      orders: [ORDER({ lines: [LINE({ quantity: 3, awaitingStockQty: 1 })] })],
      variants: [VARIANT({ onHand: 0, available: 0 })],
      invoices: [INVOICE({ amountCents: 6000 })],
      payments: [PAYMENT({ amountCents: 6000 })],
    });

    await h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Délai' });

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 2, available: 2 }));
    expect(h.orders[0].lines[0].awaitingStockQty).toBe(0);
    expect(h.movements).toEqual([
      expect.objectContaining({ kind: ShopStockMovementKind.RETURN, onHandDelta: 2 }),
    ]);
  });

  it('déclinaison non suivie : rien à reprendre, ni perte, ni précommande à servir', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT({ trackStock: false, onHand: 0, available: 0 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Taille',
      lostLineIds: ['line-1'],
    });

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.movements).toHaveLength(0);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', []);
  });

  it('les unités déjà retirées par un échange ne reviennent pas une seconde fois (ADR-0020)', async () => {
    const h = makeWorld({
      orders: [ORDER({ lines: [LINE({ quantity: 3, cancelledQty: 1 })] })],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    await h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' });

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(h.movements).toEqual([
      expect.objectContaining({ kind: ShopStockMovementKind.RETURN, onHandDelta: 2 }),
    ]);
  });
});

describe('cancelAndRefund — les factures d’un échange (ADR-0020)', () => {
  /** Après un échange : un t-shirt L gardé, un kimono à 35 € pris. */
  const ECHANGEE = (over = {}) =>
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
      ...over,
    });
  const KIMONO = () => VARIANT({ id: 'v-2', productId: 'p-2', label: '140', onHand: 2, available: 2 });

  it('reste à payer réglé par carte, commande en espèces : chacun rendu par son moyen, sur sa facture', async () => {
    const h = makeWorld({
      orders: [ECHANGEE()],
      variants: [VARIANT(), KIMONO()],
      invoices: [INVOICE(), SUPPLEMENT({ status: InvoiceStatus.PAID })],
      payments: [
        PAYMENT(),
        PAYMENT({
          id: 'pay-sup',
          invoiceId: 'inv-sup',
          amountCents: 1500,
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: 'pi_sup',
          createdAt: T1,
        }),
      ],
      adjustments: [ADJUSTMENT()],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Déménagement',
    });

    // Reviennent les articles encore dans la commande : un t-shirt, un kimono.
    expect(h.movements.map((m) => [m.kind, m.orderLineId, m.onHandDelta])).toEqual([
      [ShopStockMovementKind.RETURN, 'line-1', 1],
      [ShopStockMovementKind.RETURN, 'line-2', 1],
    ]);
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-1',
        amountCents: -4000,
        method: ClubPaymentMethod.MANUAL_CASH,
      }),
    ]);
    expect(h.stripeRefunds.refundPayment).toHaveBeenCalledWith({
      clubId: 'club-1',
      paymentId: 'pay-sup',
      amountCents: 1500,
      reason: 'Déménagement',
    });
    expect(h.scheduleEngine.closeScheduleForInvoice.mock.calls).toEqual([
      ['inv-1', InvoiceStatus.VOID],
      ['inv-sup', InvoiceStatus.VOID],
    ]);
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).not.toHaveBeenCalled();
    expect(res.cardRefunds).toEqual([
      { paymentId: 'pay-sup', amountCents: 1500, ok: true, error: null },
    ]);
    expect(res.manualRefundedCents).toBe(4000);
  });

  it('reste à payer jamais réglé : annulé avec la commande, et sa session fermée', async () => {
    const h = makeWorld({
      orders: [ECHANGEE()],
      variants: [VARIANT(), KIMONO()],
      invoices: [INVOICE(), SUPPLEMENT()],
      payments: [PAYMENT()],
      adjustments: [ADJUSTMENT()],
    });

    const res = await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Déménagement',
    });

    expect(h.invoices.find((i) => i.id === 'inv-sup')).toEqual(
      expect.objectContaining({
        status: InvoiceStatus.VOID,
        voidReason: 'Commande annulée : Déménagement',
      }),
    );
    expect(h.creditNotesOf().map((c) => [c.parentInvoiceId, c.amountCents])).toEqual([
      ['inv-1', 4000],
    ]);
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).toHaveBeenCalledWith(
      'club-1',
      'inv-sup',
    );
    expect(res.invoiceVoided).toBe(true);
  });

  it('annulation simple : le reste à payer jamais encaissé est annulé et fermé aussi', async () => {
    const h = makeWorld({
      orders: [ECHANGEE({ status: ShopOrderStatus.PENDING, paidAt: null, fulfilledAt: null })],
      variants: [VARIANT({ onHand: 5, available: 4 }), KIMONO()],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN }), SUPPLEMENT()],
      adjustments: [ADJUSTMENT()],
    });

    await h.refunds.cancelUnpaid('club-1', 'order-1');

    expect(h.invoices.map((i) => [i.id, i.status])).toEqual([
      ['inv-1', InvoiceStatus.VOID],
      ['inv-sup', InvoiceStatus.VOID],
    ]);
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice.mock.calls).toEqual([
      ['club-1', 'inv-1'],
      ['club-1', 'inv-sup'],
    ]);
    // Les unités encore dans la commande sont libérées, pas celle échangée.
    expect(h.variants.map((v) => [v.id, v.available])).toEqual([
      ['v-1', 5],
      ['v-2', 3],
    ]);
  });
});

describe('preview — le plan, sans rien écrire', () => {
  it('dit ce que ferait l’annulation', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK })],
      cheques: [CHEQUE()],
    });

    await expect(h.refunds.preview('club-1', 'order-1')).resolves.toEqual({
      blockers: [],
      delivered: false,
      exited: true,
      refunds: [
        { kind: 'CHEQUE_RETURN', paymentId: 'pay-1', amountCents: 4000, chequeNumber: '0012' },
      ],
      writeOffCents: 0,
      voidInvoice: false,
      lines: [
        { lineId: 'line-1', label: 'T-shirt — L', returnUnits: 2, releaseUnits: 0, awaitingUnits: 0 },
      ],
    });

    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.cheques[0].status).toBe(ChequeStatus.PENDING);
  });
});

describe('après le commit — un effet accessoire qui échoue ne défait rien', () => {
  it('contre-passation, échéancier et session en échec : l’annulation tient, et chaque échec se dit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
      payments: [PAYMENT({ amountCents: 1500 })],
    });
    h.accounting.createContraEntryForCreditNote.mockRejectedValueOnce(
      new Error('plan comptable incomplet'),
    );
    h.scheduleEngine.closeScheduleForInvoice.mockRejectedValueOnce(new Error('verrou'));
    h.stripeCheckout.expireCheckoutSessionForInvoice.mockRejectedValueOnce(
      new Error('Stripe indisponible'),
    );
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      await h.refunds.cancelAndRefund('club-1', 'u-admin', {
        orderId: 'order-1',
        reason: 'Désistement',
      });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/contre-passation impossible/));
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/échéancier/));
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/PAYABLE/));
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.refundsOf()).toHaveLength(1);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
  });
});

describe('cancelUnpaid — l’annulation simple, gardée pour l’application mobile', () => {
  it('sans règlement : annule, libère, annule la facture puis ferme sa session', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    const res = await h.refunds.cancelUnpaid('club-1', 'order-1');

    expect(res.status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variants[0].available).toBe(5);
    expect(h.invoices[0]).toEqual(
      expect.objectContaining({
        status: InvoiceStatus.VOID,
        voidReason: 'Commande annulée par le club.',
      }),
    );
    expect(h.events).toEqual(['commit', 'allocate', 'schedule', 'expire']);
  });

  it('avec un règlement : refuse, renvoie vers « Annuler et rembourser », ne ferme rien', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
      payments: [PAYMENT({ amountCents: 1500 })],
    });

    await expect(h.refunds.cancelUnpaid('club-1', 'order-1')).rejects.toThrow(
      /Annuler et rembourser/,
    );

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
    expect(h.scheduleEngine.closeScheduleForInvoice).not.toHaveBeenCalled();
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).not.toHaveBeenCalled();
  });

  it('commande sans facture : rien à fermer', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
    });

    await h.refunds.cancelUnpaid('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.scheduleEngine.closeScheduleForInvoice).not.toHaveBeenCalled();
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).not.toHaveBeenCalled();
  });
});

describe('cas limites — la remise et le chèque, entre l’aperçu et la confirmation', () => {
  const CHANGES: Array<[string, Partial<WorldCheque>]> = [
    ['remis en banque', { status: ChequeStatus.DEPOSITED }],
    ['pris dans une remise en préparation', { depositId: 'dep-1' }],
  ];

  it.each(CHANGES)('chèque %s entre-temps : rien n’est écrit', async (_cas, change) => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT({ method: ClubPaymentMethod.MANUAL_CHECK })],
      cheques: [CHEQUE()],
    });
    h.meanwhile(() => Object.assign(h.cheques[0], change));

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Doublon' }),
    ).rejects.toThrow(/vient d’être remis en banque/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.payments).toHaveLength(1);
  });

  it('commande payée remise entre-temps : sans les articles, rien n’est repris', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });
    h.meanwhile(() => {
      h.orders[0].deliveredAt = T0;
    });

    await expect(
      h.refunds.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/vient de changer/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 3, available: 3 }));
    expect(h.refundsOf()).toHaveLength(0);
  });

  it('remise avant paiement : l’article rapporté revient au placard, la facture est annulée', async () => {
    const h = makeWorld({
      orders: [PENDING({ fulfilledAt: T0, deliveredAt: T0 })],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    await h.refunds.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Taille',
      goodsReturned: true,
    });

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    // Sortie à la remise : elle revient au placard, pas seulement au vendable.
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(h.movements.map((m) => m.kind)).toEqual([ShopStockMovementKind.RETURN]);
    expect(h.invoices[0].status).toBe(InvoiceStatus.VOID);
  });
});

describe('la commande côté adhérent', () => {
  it('ne montre ni le motif d’une annulation par le club, ni l’historique des échanges', async () => {
    const h = makeWorld({
      orders: [
        ORDER({
          status: ShopOrderStatus.CANCELLED,
          cancelledAt: T1,
          cancelReason: 'Client difficile',
        }),
      ],
      variants: [VARIANT()],
      invoices: [INVOICE(), SUPPLEMENT({ status: InvoiceStatus.VOID })],
      adjustments: [ADJUSTMENT()],
    });

    const [vue] = await h.shop.listOrdersForViewer('club-1', {
      memberId: 'm-1',
      contactId: null,
    });
    const [admin] = await h.shop.listOrdersAdmin('club-1');

    expect(vue).toEqual(
      expect.objectContaining({
        id: 'order-1',
        status: ShopOrderStatus.CANCELLED,
        cancelReason: null,
        adjustments: [],
      }),
    );
    expect(admin.cancelReason).toBe('Client difficile');
    expect(admin.adjustments).toEqual([
      expect.objectContaining({
        id: 'adj-1',
        kind: ShopOrderAdjustmentKind.EXCHANGE,
        reason: 'Taille trop petite',
        supplementInvoiceId: 'inv-sup',
        supplementInvoiceStatus: InvoiceStatus.VOID,
        signed: false,
      }),
    ]);
  });
});
