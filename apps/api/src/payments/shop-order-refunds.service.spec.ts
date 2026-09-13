import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
  ShopStockMovementKind,
} from '@prisma/client';
import { ShopService } from '../shop/shop.service';
import { ShopStockService } from '../shop/shop-stock.service';
import { CreditNotesService } from './credit-notes.service';
import { ShopOrderRefundsService } from './shop-order-refunds.service';

/**
 * « Annuler et rembourser » (ADR-0019), de bout en bout : le vrai
 * `ShopService`, le vrai moteur de stock et le vrai service d'avoirs, sur un
 * double de PostgreSQL.
 *
 * Le double APPLIQUE chaque clause des `where` et lève sur toute clause qu'il
 * ne sait pas simuler : un prédicat oublié par le code change le résultat au
 * lieu de passer inaperçu. `$transaction` fait un ROLLBACK réel. Seuls les
 * effets distants sont simulés : Stripe, l'échéancier, la comptabilité.
 */

type Line = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  label: string;
  awaitingStockQty: number;
};
type Order = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  status: ShopOrderStatus;
  totalCents: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  termsAcceptedAt: Date | null;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  deliverySignerName: string | null;
  lines: Line[];
};
type Variant = {
  id: string;
  clubId: string;
  trackStock: boolean;
  onHand: number;
  available: number;
  lowStockAlertedAt: Date | null;
};
type Invoice = Record<string, any> & {
  id: string;
  clubId: string;
  shopOrderId: string | null;
  status: InvoiceStatus;
  amountCents: number;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
};
type Payment = Record<string, any> & {
  id: string;
  clubId: string;
  invoiceId: string;
  amountCents: number;
  createdAt: Date;
};
type Cheque = {
  id: string;
  clubId: string;
  paymentId: string;
  number: string | null;
  status: ChequeStatus;
  depositId: string | null;
  notes: string | null;
};

const T0 = new Date('2026-09-01T10:00:00Z');

const LINE = (over: Partial<Line> = {}): Line => ({
  id: 'line-1',
  orderId: 'order-1',
  productId: 'p-1',
  variantId: 'v-1',
  quantity: 2,
  unitPriceCents: 2000,
  label: 'T-shirt — L',
  awaitingStockQty: 0,
  ...over,
});

/** Payée : les deux t-shirts ont quitté le placard. */
const ORDER = (over: Partial<Order> = {}): Order => ({
  id: 'order-1',
  clubId: 'club-1',
  memberId: 'm-1',
  contactId: null,
  status: ShopOrderStatus.PAID,
  totalCents: 4000,
  note: null,
  createdAt: T0,
  updatedAt: T0,
  paidAt: T0,
  cancelledAt: null,
  cancelReason: null,
  cancelledByUserId: null,
  termsAcceptedAt: null,
  fulfilledAt: T0,
  deliveredAt: null,
  deliverySignerName: null,
  lines: [LINE()],
  ...over,
});

/** En attente : les deux t-shirts sont réservés, toujours au placard. */
const PENDING = (over: Partial<Order> = {}): Order =>
  ORDER({ status: ShopOrderStatus.PENDING, paidAt: null, fulfilledAt: null, ...over });

const VARIANT = (over: Partial<Variant> = {}): Variant => ({
  id: 'v-1',
  clubId: 'club-1',
  trackStock: true,
  onHand: 3,
  available: 3,
  lowStockAlertedAt: null,
  ...over,
});

const INVOICE = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  clubId: 'club-1',
  shopOrderId: 'order-1',
  status: InvoiceStatus.PAID,
  amountCents: 4000,
  label: 'Boutique — commande',
  familyId: 'fam-1',
  householdGroupId: null,
  clubSeasonId: null,
  isCreditNote: false,
  parentInvoiceId: null,
  creditNoteReason: null,
  voidReason: null,
  createdAt: T0,
  ...over,
});

const PAYMENT = (over: Partial<Payment> = {}): Payment => ({
  id: 'pay-1',
  clubId: 'club-1',
  invoiceId: 'inv-1',
  amountCents: 4000,
  method: ClubPaymentMethod.MANUAL_CASH,
  externalRef: null,
  refundedPaymentId: null,
  financialAccountId: 'fa-caisse',
  paidByMemberId: 'm-1',
  paidByContactId: null,
  createdAt: T0,
  ...over,
});

const CHEQUE = (over: Partial<Cheque> = {}): Cheque => ({
  id: 'chq-1',
  clubId: 'club-1',
  paymentId: 'pay-1',
  number: '0012',
  status: ChequeStatus.PENDING,
  depositId: null,
  notes: null,
  ...over,
});

function allowOnly(where: object, keys: string[]): void {
  for (const k of Object.keys(where)) {
    if (!keys.includes(k)) throw new Error(`clause non simulée : ${k}`);
  }
}

/** `null` ou `{ not: null }`, appliqués pour de vrai. */
function nullity(value: unknown, clause: any): boolean {
  if (clause === null) return value === null;
  if (clause && 'not' in clause && clause.not === null) return value !== null;
  throw new Error('clause de nullité non simulée');
}

function makeWorld(seed: {
  orders: Order[];
  variants: Variant[];
  invoices?: Invoice[];
  payments?: Payment[];
  cheques?: Cheque[];
  deposits?: Array<{ id: string; financialAccountId: string }>;
}) {
  const { orders, variants } = seed;
  const invoices = seed.invoices ?? [];
  const payments = seed.payments ?? [];
  const cheques = seed.cheques ?? [];
  const deposits = seed.deposits ?? [];
  const movements: Array<Record<string, any>> = [];
  /** Ordre des gestes : ce qui est APRÈS le commit se lit ici. */
  const events: string[] = [];
  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

  const paymentsOf = (invoiceId: string) =>
    payments.filter((p) => p.invoiceId === invoiceId);

  const invoiceMatches = (i: Invoice, w: any): boolean => {
    allowOnly(w, [
      'id',
      'clubId',
      'shopOrderId',
      'status',
      'payments',
      'parentInvoiceId',
      'isCreditNote',
    ]);
    if (w.id !== undefined && i.id !== w.id) return false;
    if (w.clubId !== undefined && i.clubId !== w.clubId) return false;
    if (w.shopOrderId !== undefined) {
      if (w.shopOrderId && typeof w.shopOrderId === 'object') {
        if (!w.shopOrderId.in.includes(i.shopOrderId)) return false;
      } else if (i.shopOrderId !== w.shopOrderId) return false;
    }
    if (w.status !== undefined) {
      if (w.status && typeof w.status === 'object') {
        if (i.status === w.status.not) return false;
      } else if (i.status !== w.status) return false;
    }
    if (w.parentInvoiceId !== undefined && i.parentInvoiceId !== w.parentInvoiceId) {
      return false;
    }
    if (w.isCreditNote !== undefined && i.isCreditNote !== w.isCreditNote) return false;
    if (w.payments !== undefined) {
      if (JSON.stringify(w.payments) !== '{"none":{}}') {
        throw new Error('clause payments non simulée');
      }
      if (paymentsOf(i.id).length > 0) return false;
    }
    return true;
  };

  const orderMatches = (o: Order, w: any): boolean => {
    allowOnly(w, ['id', 'clubId', 'status', 'fulfilledAt', 'deliveredAt', 'OR']);
    if (w.id !== undefined && o.id !== w.id) return false;
    if (w.clubId !== undefined && o.clubId !== w.clubId) return false;
    if (w.status !== undefined && o.status !== w.status) return false;
    if (w.fulfilledAt !== undefined && !nullity(o.fulfilledAt, w.fulfilledAt)) return false;
    if (w.deliveredAt !== undefined && !nullity(o.deliveredAt, w.deliveredAt)) return false;
    if (w.OR !== undefined) {
      const inv = invoices.find((i) => i.shopOrderId === o.id) ?? null;
      const any = w.OR.some((branch: any) => {
        allowOnly(branch, ['invoice']);
        const is = branch.invoice.is;
        return is === null ? inv === null : inv !== null && invoiceMatches(inv, is);
      });
      if (!any) return false;
    }
    return true;
  };

  const variantMatches = (v: Variant, w: any): boolean => {
    allowOnly(w, ['id', 'clubId', 'trackStock', 'onHand']);
    if (w.id !== undefined && v.id !== w.id) return false;
    if (w.clubId !== undefined && v.clubId !== w.clubId) return false;
    if (w.trackStock !== undefined && v.trackStock !== w.trackStock) return false;
    if (w.onHand !== undefined && !(v.onHand >= w.onHand.gte)) return false;
    return true;
  };

  const db: any = {
    shopOrder: {
      findFirst: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return null;
        const inv = invoices.find((i) => i.shopOrderId === o.id);
        return {
          ...structuredClone(o),
          invoice: inv
            ? { id: inv.id, payments: paymentsOf(inv.id).map((p) => ({ id: p.id })) }
            : null,
        };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) throw new Error('commande introuvable');
        return structuredClone(o);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        for (const o of hit) Object.assign(o, data);
        return { count: hit.length };
      }),
    },
    shopOrderLine: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['orderId', 'awaitingStockQty']);
        const lines = orders.find((o) => o.id === where.orderId)?.lines ?? [];
        const hit = lines.filter((l) => l.awaitingStockQty > where.awaitingStockQty.gt);
        for (const l of hit) l.awaitingStockQty = data.awaitingStockQty;
        return { count: hit.length };
      }),
    },
    shopProductVariant: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((v) => variantMatches(v, where));
        for (const v of hit) {
          v.onHand += (data.onHand?.increment ?? 0) - (data.onHand?.decrement ?? 0);
          v.available +=
            (data.available?.increment ?? 0) - (data.available?.decrement ?? 0);
          if ('lowStockAlertedAt' in data) v.lowStockAlertedAt = data.lowStockAlertedAt;
        }
        return { count: hit.length };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return { id: uid('mv'), ...data };
      }),
    },
    invoice: {
      findFirst: jest.fn(async ({ where, include }: any) => {
        const i = invoices.find((x) => invoiceMatches(x, where));
        if (!i) return null;
        if (!include?.payments) return structuredClone(i);
        return {
          ...structuredClone(i),
          payments: paymentsOf(i.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((p) => {
              const c = cheques.find((x) => x.paymentId === p.id);
              const d = deposits.find((x) => x.id === c?.depositId);
              return {
                ...structuredClone(p),
                cheque: c
                  ? {
                      id: c.id,
                      number: c.number,
                      status: c.status,
                      depositId: c.depositId,
                      deposit: d ? { financialAccountId: d.financialAccountId } : null,
                    }
                  : null,
              };
            }),
        };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        invoices
          .filter((i) => invoiceMatches(i, where))
          .map((i) => ({ id: i.id, shopOrderId: i.shopOrderId, status: i.status })),
      ),
      aggregate: jest.fn(async ({ where }: any) => {
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        return {
          _sum: {
            amountCents: hit.length ? hit.reduce((s, i) => s + i.amountCents, 0) : null,
          },
        };
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: uid('cn'), shopOrderId: null, voidReason: null, ...data };
        invoices.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        for (const i of hit) Object.assign(i, data);
        return { count: hit.length };
      }),
    },
    payment: {
      count: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['invoiceId', 'clubId']);
        return payments.filter(
          (p) => p.invoiceId === where.invoiceId && p.clubId === where.clubId,
        ).length;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: uid('pay'), externalRef: null, createdAt: new Date(), ...data };
        payments.push(row);
        return row;
      }),
    },
    cheque: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id', 'clubId', 'status', 'depositId']);
        const hit = cheques.filter(
          (c) =>
            c.id === where.id &&
            c.clubId === where.clubId &&
            c.status === where.status &&
            (where.depositId === undefined || c.depositId === where.depositId),
        );
        for (const c of hit) Object.assign(c, data);
        return { count: hit.length };
      }),
    },
    member: { findMany: jest.fn(async () => []) },
    contact: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = structuredClone({ orders, variants, invoices, payments, cheques, movements });
      try {
        const out = await fn(db);
        events.push('commit');
        return out;
      } catch (e) {
        const restore = (arr: any[], from: any[]) => arr.splice(0, arr.length, ...from);
        restore(orders, snap.orders);
        restore(variants, snap.variants);
        restore(invoices, snap.invoices);
        restore(payments, snap.payments);
        restore(cheques, snap.cheques);
        restore(movements, snap.movements);
        events.push('rollback');
        throw e;
      }
    }),
  };

  const trace = <A extends unknown[], R>(name: string, impl: (...args: A) => Promise<R>) =>
    jest.fn(async (...args: A) => {
      events.push(name);
      return impl(...args);
    });

  const preorders = { allocateQuietly: trace('allocate', async () => undefined) };
  const stock = new ShopStockService(db);
  const shop = new ShopService(db, stock, {} as never, preorders as never);
  const accounting = {
    createContraEntryForCreditNote: trace('accounting', async () => undefined),
  };
  const creditNotes = new CreditNotesService(db, accounting as never);
  const stripeRefunds = {
    refundPayment: trace('stripe', async (args: { paymentId: string }) => ({
      refundId: 're_1',
      amountCents: payments.find((p) => p.id === args.paymentId)?.amountCents ?? 0,
    })),
  };
  const scheduleEngine = {
    sumInFlightForInvoice: jest.fn(async (_invoiceId: string) => 0),
    closeScheduleForInvoice: trace('schedule', async () => undefined),
  };
  const stripeCheckout = {
    expireCheckoutSessionForInvoice: trace('expire', async () => 'expired' as const),
  };
  const svc = new ShopOrderRefundsService(
    db,
    shop,
    creditNotes,
    stripeRefunds as never,
    scheduleEngine as never,
    stripeCheckout as never,
    preorders as never,
  );

  /**
   * Un geste concurrent, APRÈS la lecture du plan et AVANT la transaction :
   * la lecture de l'échéancier est la dernière du plan.
   */
  const meanwhile = (fn: () => void) =>
    scheduleEngine.sumInFlightForInvoice.mockImplementationOnce(async () => {
      fn();
      return 0;
    });

  return {
    svc,
    db,
    orders,
    variants,
    invoices,
    payments,
    cheques,
    movements,
    events,
    preorders,
    accounting,
    stripeRefunds,
    scheduleEngine,
    stripeCheckout,
    meanwhile,
  };
}

const creditNotesOf = (h: ReturnType<typeof makeWorld>) =>
  h.invoices.filter((i) => i.isCreditNote);
const refundsOf = (h: ReturnType<typeof makeWorld>) =>
  h.payments.filter((p) => p.amountCents < 0);

describe('cancelAndRefund — chaque règlement rendu par son moyen', () => {
  it('en attente, sans règlement : libère le stock, annule la facture et ferme sa session', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    const res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
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
    expect(creditNotesOf(h)).toHaveLength(0);
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
      }),
    );
  });

  it('payée en espèces : rend l’argent et reprend les articles en stock', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE()],
      payments: [PAYMENT()],
    });

    const res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
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
    expect(refundsOf(h)).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-1',
        amountCents: -4000,
        method: ClubPaymentMethod.MANUAL_CASH,
        refundedPaymentId: 'pay-1',
        financialAccountId: 'fa-caisse',
        paidByMemberId: 'm-1',
      }),
    ]);
    const avoirs = creditNotesOf(h);
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

    const res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Désistement',
    });

    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(refundsOf(h).map((p) => p.amountCents)).toEqual([-1500]);
    expect(creditNotesOf(h).map((a) => [a.amountCents, a.creditNoteReason])).toEqual([
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

    const res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Doublon',
    });

    expect(h.cheques[0]).toEqual(
      expect.objectContaining({
        status: ChequeStatus.CANCELLED,
        notes: 'Rendu à l’adhérent : commande annulée — Doublon',
      }),
    );
    expect(refundsOf(h)).toEqual([
      expect.objectContaining({
        method: ClubPaymentMethod.MANUAL_CHECK,
        financialAccountId: 'fa-cheques',
        amountCents: -4000,
      }),
    ]);
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      creditNotesOf(h)[0].id,
      'pay-1',
      null,
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

    const res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Doublon',
    });

    expect(h.cheques[0].status).toBe(ChequeStatus.DEPOSITED);
    expect(refundsOf(h)).toEqual([
      expect.objectContaining({
        method: ClubPaymentMethod.MANUAL_TRANSFER,
        financialAccountId: 'fa-banque',
        refundedPaymentId: 'pay-1',
      }),
    ]);
    // 511200 a été soldé à la remise : la sortie part de la banque.
    expect(h.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(
      'club-1',
      creditNotesOf(h)[0].id,
      'pay-1',
      'fa-banque',
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

    const res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Rupture fournisseur',
    });

    // Le paiement négatif et l'avoir arrivent par le webhook (ADR-0011).
    expect(refundsOf(h)).toHaveLength(0);
    expect(creditNotesOf(h)).toHaveLength(0);
    expect(h.stripeRefunds.refundPayment).toHaveBeenCalledWith({
      clubId: 'club-1',
      paymentId: 'pay-1',
      amountCents: null,
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

    let res!: Awaited<ReturnType<typeof h.svc.cancelAndRefund>>;
    try {
      res = await h.svc.cancelAndRefund('club-1', 'u-admin', {
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/rapporter les articles/);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.payments).toHaveLength(1);
    expect(h.movements).toHaveLength(0);

    await h.svc.cancelAndRefund('club-1', 'u-admin', {
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
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

    await expect(h.svc.preview('club-1', 'order-1')).rejects.toThrow(NotFoundException);
    await expect(
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(NotFoundException);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
  });

  it('motif vide : refus avant toute lecture', async () => {
    const h = makeWorld({ orders: [ORDER()], variants: [VARIANT()] });

    await expect(
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: '   ' }),
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
      h.svc.cancelAndRefund('club-1', 'u-admin', {
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
      h.svc.cancelAndRefund('club-1', 'u-admin', {
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Doublon' }),
    ).rejects.toThrow(/vient d’être remis en banque/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 3, available: 3 }));
    expect(h.movements).toHaveLength(0);
    expect(h.payments).toHaveLength(1);
    expect(creditNotesOf(h)).toHaveLength(0);
  });

  it('règlement enregistré entre-temps : rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.meanwhile(() => h.payments.push(PAYMENT({ id: 'pay-tardif', amountCents: 1000 })));

    await expect(
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/avoir vient d’être émis/);

    expect(h.events).toEqual(['rollback']);
    expect(refundsOf(h)).toHaveLength(0);
    expect(creditNotesOf(h).map((a) => a.id)).toEqual(['cn-manuel']);
  });

  it('commande remise entre-temps : le plan ne vaut plus, rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
    h.meanwhile(() => Object.assign(h.orders[0], { fulfilledAt: T0, deliveredAt: T0 }));

    await expect(
      h.svc.cancelAndRefund('club-1', 'u-admin', {
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/déjà annulée/);

    expect(h.events).toEqual(['rollback']);
    expect(h.variants[0].available).toBe(3);
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

    await h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Délai' });

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

    await h.svc.cancelAndRefund('club-1', 'u-admin', {
      orderId: 'order-1',
      reason: 'Taille',
      lostLineIds: ['line-1'],
    });

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.movements).toHaveLength(0);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', []);
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

    await expect(h.svc.preview('club-1', 'order-1')).resolves.toEqual({
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
      await h.svc.cancelAndRefund('club-1', 'u-admin', {
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
    expect(refundsOf(h)).toHaveLength(1);
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

    const res = await h.svc.cancelUnpaid('club-1', 'order-1');

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

    await expect(h.svc.cancelUnpaid('club-1', 'order-1')).rejects.toThrow(
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

    await h.svc.cancelUnpaid('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.scheduleEngine.closeScheduleForInvoice).not.toHaveBeenCalled();
    expect(h.stripeCheckout.expireCheckoutSessionForInvoice).not.toHaveBeenCalled();
  });
});

describe('cas limites — la remise et le chèque, entre l’aperçu et la confirmation', () => {
  const CHANGES: Array<[string, Partial<Cheque>]> = [
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Doublon' }),
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
      h.svc.cancelAndRefund('club-1', 'u-admin', { orderId: 'order-1', reason: 'Taille' }),
    ).rejects.toThrow(/vient de changer/);

    expect(h.events).toEqual(['rollback']);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 3, available: 3 }));
    expect(refundsOf(h)).toHaveLength(0);
  });

  it('remise avant paiement : l’article rapporté revient au placard, la facture est annulée', async () => {
    const h = makeWorld({
      orders: [PENDING({ fulfilledAt: T0, deliveredAt: T0 })],
      variants: [VARIANT({ onHand: 3, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });

    await h.svc.cancelAndRefund('club-1', 'u-admin', {
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
  it('ne montre jamais le motif d’une annulation par le club', async () => {
    const h = makeWorld({
      orders: [
        ORDER({
          status: ShopOrderStatus.CANCELLED,
          cancelledAt: T0,
          cancelReason: 'Client difficile',
        }),
      ],
      variants: [VARIANT()],
      invoices: [INVOICE()],
    });
    h.db.shopOrder.findMany = jest.fn(async ({ where }: any) => {
      allowOnly(where, ['clubId', 'memberId', 'contactId']);
      return h.orders
        .filter(
          (o) =>
            o.clubId === where.clubId &&
            (where.memberId === undefined || o.memberId === where.memberId) &&
            (where.contactId === undefined || o.contactId === where.contactId),
        )
        .map((o) => structuredClone(o));
    });
    const shop = new ShopService(
      h.db,
      new ShopStockService(h.db),
      {} as never,
      { allocateQuietly: jest.fn() } as never,
    );

    const [vue] = await shop.listOrdersForViewer('club-1', {
      memberId: 'm-1',
      contactId: null,
    });
    const [admin] = await shop.listOrdersAdmin('club-1');

    expect(vue).toEqual(
      expect.objectContaining({
        id: 'order-1',
        status: ShopOrderStatus.CANCELLED,
        cancelReason: null,
      }),
    );
    expect(admin.cancelReason).toBe('Client difficile');
  });
});
