import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderAdjustmentKind,
  ShopOrderStatus,
} from '@prisma/client';
import { CreditNotesService } from '../src/payments/credit-notes.service';
import { ShopOrderAdjustmentsService } from '../src/payments/shop-order-adjustments.service';
import { ShopOrderMoneyService } from '../src/payments/shop-order-money.service';
import { ShopOrderRefundsService } from '../src/payments/shop-order-refunds.service';
import { ShopStockService } from '../src/shop/shop-stock.service';
import { ShopService } from '../src/shop/shop.service';

/**
 * Un monde de commandes boutique pour tester ce qui déplace l'argent et la
 * marchandise d'une commande — l'annulation remboursée (ADR-0019), l'échange
 * et l'annulation d'articles (ADR-0020) — de bout en bout : les vrais
 * `ShopService`, moteur de stock, service d'avoirs et `ShopOrderMoneyService`,
 * sur un double de PostgreSQL.
 *
 * Le double APPLIQUE chaque clause des `where` et lève sur toute clause qu'il
 * ne sait pas simuler : un prédicat oublié par le code change le résultat au
 * lieu de passer inaperçu (cf. pitfalls/double-ignore-une-clause-du-where.md).
 * `$transaction` fait un ROLLBACK réel. Seuls les effets distants sont
 * simulés : Stripe, l'échéancier, la comptabilité, l'attribution des
 * précommandes.
 *
 * Hors de `src/` : ce n'est pas une suite de tests, et ce n'est pas du code
 * livré (`tsconfig.build.json` exclut `test/`).
 */

export type WorldLine = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  label: string;
  awaitingStockQty: number;
  cancelledQty: number;
  createdAt: Date;
};

export type WorldOrder = {
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
  termsAssetId: string | null;
  termsAcceptedAt: Date | null;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  deliveredByUserId: string | null;
  deliverySignerName: string | null;
  deliverySignaturePng: string | null;
  deliveredLines: unknown;
  lines: WorldLine[];
};

export type WorldProduct = {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  preorderEnabled: boolean;
};

export type WorldVariant = {
  id: string;
  clubId: string;
  productId: string;
  label: string | null;
  priceCents: number | null;
  active: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  lowStockAlertedAt: Date | null;
  updatedAt: Date;
};

export type WorldInvoice = Record<string, any> & {
  id: string;
  clubId: string;
  shopOrderId: string | null;
  shopAdjustmentId: string | null;
  status: InvoiceStatus;
  amountCents: number;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
  createdAt: Date;
};

export type WorldPayment = Record<string, any> & {
  id: string;
  clubId: string;
  invoiceId: string;
  amountCents: number;
  createdAt: Date;
};

export type WorldCheque = {
  id: string;
  clubId: string;
  paymentId: string;
  number: string | null;
  status: ChequeStatus;
  depositId: string | null;
  notes: string | null;
};

export type WorldAdjustment = Record<string, any> & {
  id: string;
  clubId: string;
  orderId: string;
  kind: ShopOrderAdjustmentKind;
  createdAt: Date;
  signedAt: Date | null;
};

export const T0 = new Date('2026-09-01T10:00:00Z');
export const T1 = new Date('2026-09-05T10:00:00Z');

/**
 * En-tête PNG valide : la signature n'est pas décodée à l'échange, seulement
 * vérifiée comme étant bien un PNG.
 */
export const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export const LINE = (over: Partial<WorldLine> = {}): WorldLine => ({
  id: 'line-1',
  orderId: 'order-1',
  productId: 'p-1',
  variantId: 'v-1',
  quantity: 2,
  unitPriceCents: 2000,
  label: 'T-shirt — L',
  awaitingStockQty: 0,
  cancelledQty: 0,
  createdAt: T0,
  ...over,
});

/** Payée : les deux t-shirts ont quitté le placard. */
export const ORDER = (over: Partial<WorldOrder> = {}): WorldOrder => ({
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
  termsAssetId: null,
  termsAcceptedAt: null,
  fulfilledAt: T0,
  deliveredAt: null,
  deliveredByUserId: null,
  deliverySignerName: null,
  deliverySignaturePng: null,
  deliveredLines: null,
  lines: [LINE()],
  ...over,
});

/** En attente : les deux t-shirts sont réservés, toujours au placard. */
export const PENDING = (over: Partial<WorldOrder> = {}): WorldOrder =>
  ORDER({ status: ShopOrderStatus.PENDING, paidAt: null, fulfilledAt: null, ...over });

export const PRODUCT = (over: Partial<WorldProduct> = {}): WorldProduct => ({
  id: 'p-1',
  name: 'T-shirt',
  priceCents: 2000,
  active: true,
  preorderEnabled: false,
  ...over,
});

export const VARIANT = (over: Partial<WorldVariant> = {}): WorldVariant => ({
  id: 'v-1',
  clubId: 'club-1',
  productId: 'p-1',
  label: 'L',
  priceCents: null,
  active: true,
  trackStock: true,
  onHand: 3,
  available: 3,
  lowStockAlertedAt: null,
  updatedAt: T0,
  ...over,
});

export const INVOICE = (over: Partial<WorldInvoice> = {}): WorldInvoice => ({
  id: 'inv-1',
  clubId: 'club-1',
  shopOrderId: 'order-1',
  shopAdjustmentId: null,
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

/** La facture du reste à payer de l'échange `adj-1`, pas encore réglée. */
export const SUPPLEMENT = (over: Partial<WorldInvoice> = {}): WorldInvoice =>
  INVOICE({
    id: 'inv-sup',
    shopOrderId: null,
    shopAdjustmentId: 'adj-1',
    status: InvoiceStatus.OPEN,
    amountCents: 1500,
    label: 'Échange boutique — reste à payer — Camille MARTIN',
    createdAt: T1,
    ...over,
  });

export const PAYMENT = (over: Partial<WorldPayment> = {}): WorldPayment => ({
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

export const CHEQUE = (over: Partial<WorldCheque> = {}): WorldCheque => ({
  id: 'chq-1',
  clubId: 'club-1',
  paymentId: 'pay-1',
  number: '0012',
  status: ChequeStatus.PENDING,
  depositId: null,
  notes: null,
  ...over,
});

/** Un premier échange : un t-shirt L à 20 € contre un kimono à 35 €. */
export const ADJUSTMENT = (over: Partial<WorldAdjustment> = {}): WorldAdjustment => ({
  id: 'adj-1',
  clubId: 'club-1',
  orderId: 'order-1',
  kind: ShopOrderAdjustmentKind.EXCHANGE,
  reason: 'Taille trop petite',
  userId: 'u-admin',
  returnedLineId: 'line-1',
  returnedQty: 1,
  returnedLabel: 'T-shirt — L',
  returnedUnitPriceCents: 2000,
  goodsLost: false,
  newLineId: 'line-2',
  newQty: 1,
  newLabel: 'Kimono — 140',
  newUnitPriceCents: 3500,
  differenceCents: 1500,
  refundedCents: 0,
  cardRefundCents: 0,
  writtenOffCents: 0,
  wasDelivered: false,
  signerName: null,
  signaturePng: null,
  signedAt: null,
  createdAt: T1,
  ...over,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Échanges dont la facture du reste à payer porte un encaissement. */
const PAID_SUPPLEMENT = { supplementInvoice: { is: { payments: { some: {} } } } };

/**
 * Copie profonde qui garde des Date de ce contexte de test : celles que rend
 * structuredClone viennent d'un autre contexte, que toBeInstanceOf refuse.
 */
function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clone(v)]),
    ) as T;
  }
  return value;
}

function allowOnly(value: object, keys: string[]): void {
  for (const k of Object.keys(value)) {
    if (!keys.includes(k)) throw new Error(`clause non simulée : ${k}`);
  }
}

/** `null` ou `{ not: null }`, appliqués pour de vrai. */
function nullity(value: unknown, clause: any): boolean {
  if (clause === null) return value === null;
  if (clause && same(Object.keys(clause), ['not']) && clause.not === null) {
    return value !== null;
  }
  throw new Error('clause de nullité non simulée');
}

/** Égalité, ou `{ in: [...] }`. */
function oneOf(value: unknown, clause: any): boolean {
  if (clause !== null && typeof clause === 'object') {
    allowOnly(clause, ['in']);
    return clause.in.includes(value);
  }
  return value === clause;
}

/** Entier : égalité, `gt`, `gte`. */
function count(value: number, clause: any): boolean {
  if (clause === undefined) return true;
  if (typeof clause === 'number') return value === clause;
  allowOnly(clause, ['gt', 'gte']);
  return (
    (clause.gt === undefined || value > clause.gt) &&
    (clause.gte === undefined || value >= clause.gte)
  );
}

/** Écrit `{ increment }`, `{ decrement }` ou une valeur. */
function write(row: Record<string, any>, data: Record<string, any>): void {
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      ('increment' in value || 'decrement' in value)
    ) {
      row[key] += (value.increment ?? 0) - (value.decrement ?? 0);
    } else {
      row[key] = clone(value);
    }
  }
}

/** Les champs demandés par un `select` de colonnes. */
function pick(row: Record<string, any>, select: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (value !== true) throw new Error(`relation non simulée : ${key}`);
    if (!(key in row)) throw new Error(`champ non simulé : ${key}`);
    out[key] = clone(row[key]);
  }
  return out;
}

export function makeWorld(seed: {
  orders: WorldOrder[];
  variants: WorldVariant[];
  products?: WorldProduct[];
  invoices?: WorldInvoice[];
  payments?: WorldPayment[];
  cheques?: WorldCheque[];
  deposits?: Array<{ id: string; financialAccountId: string }>;
  adjustments?: WorldAdjustment[];
  /** Banque par défaut du club ; `null` : le club n'en a pas. */
  clubBankId?: string | null;
}) {
  const { orders, variants } = seed;
  const products = seed.products ?? [
    PRODUCT(),
    PRODUCT({ id: 'p-2', name: 'Kimono', priceCents: 3500 }),
  ];
  const invoices = seed.invoices ?? [];
  const payments = seed.payments ?? [];
  const cheques = seed.cheques ?? [];
  const deposits = seed.deposits ?? [];
  const adjustments = seed.adjustments ?? [];
  const movements: Array<Record<string, any>> = [];
  const clubs = [
    { id: 'club-1', name: 'Dojo Test', siret: null, address: '1 rue du Dojo' },
  ];
  const members = [
    {
      id: 'm-1',
      clubId: 'club-1',
      firstName: 'Camille',
      lastName: 'MARTIN',
      email: 'camille.martin@example.fr',
    },
  ];
  const families = [{ memberId: 'm-1', clubId: 'club-1', familyId: 'fam-1' }];
  /** Ordre des gestes : ce qui est APRÈS le commit se lit ici. */
  const events: string[] = [];
  let seq = 0;
  const uid = (p: string) => `${p}-n${++seq}`;
  let depth = 0;

  const paymentsOf = (invoiceId: string) =>
    payments.filter((p) => p.invoiceId === invoiceId);
  /** LA facture de la commande : `shopOrderId` est unique. */
  const mainInvoiceOf = (orderId: string) =>
    invoices.find((i) => i.shopOrderId === orderId) ?? null;
  const supplementOf = (adjustmentId: string) =>
    invoices.find((i) => i.shopAdjustmentId === adjustmentId) ?? null;
  const paidSupplementsOf = (orderId: string) =>
    adjustments.filter((a) => {
      const sup = a.orderId === orderId ? supplementOf(a.id) : null;
      return sup !== null && paymentsOf(sup.id).length > 0;
    });

  const paymentsWithCheques = (invoiceId: string) =>
    paymentsOf(invoiceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((p) => {
        const c = cheques.find((x) => x.paymentId === p.id);
        const d = deposits.find((x) => x.id === c?.depositId);
        return {
          ...clone(p),
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
      });

  // Les factures d'une commande : la sienne, ou celle du reste à payer de l'un
  // de ses échanges (ADR-0020).
  const invoiceBranch = (i: WorldInvoice, branch: any): boolean => {
    allowOnly(branch, ['shopOrderId', 'shopAdjustment']);
    if (branch.shopOrderId !== undefined) {
      return i.shopOrderId !== null && oneOf(i.shopOrderId, branch.shopOrderId);
    }
    allowOnly(branch.shopAdjustment, ['is']);
    allowOnly(branch.shopAdjustment.is, ['orderId']);
    const adj = adjustments.find((a) => a.id === i.shopAdjustmentId);
    return adj !== undefined && oneOf(adj.orderId, branch.shopAdjustment.is.orderId);
  };

  const invoiceMatches = (i: WorldInvoice, w: any): boolean => {
    allowOnly(w, [
      'id',
      'clubId',
      'shopOrderId',
      'status',
      'payments',
      'parentInvoiceId',
      'isCreditNote',
      'OR',
    ]);
    if (w.id !== undefined && i.id !== w.id) return false;
    if (w.clubId !== undefined && i.clubId !== w.clubId) return false;
    if (w.shopOrderId !== undefined && !oneOf(i.shopOrderId, w.shopOrderId)) return false;
    if (w.status !== undefined) {
      if (w.status !== null && typeof w.status === 'object') {
        allowOnly(w.status, ['not']);
        if (i.status === w.status.not) return false;
      } else if (i.status !== w.status) return false;
    }
    if (w.parentInvoiceId !== undefined && !oneOf(i.parentInvoiceId, w.parentInvoiceId)) {
      return false;
    }
    if (w.isCreditNote !== undefined && i.isCreditNote !== w.isCreditNote) return false;
    if (w.OR !== undefined && !w.OR.some((b: any) => invoiceBranch(i, b))) return false;
    if (w.payments !== undefined) {
      if (!same(w.payments, { none: {} })) throw new Error('clause payments non simulée');
      if (paymentsOf(i.id).length > 0) return false;
    }
    return true;
  };

  /** Ce que le `select` demande d'une facture, relations comprises. */
  const projectInvoice = (i: WorldInvoice, select: Record<string, any>) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(select)) {
      if (key === 'shopAdjustment') {
        const adj = adjustments.find((a) => a.id === i.shopAdjustmentId);
        out[key] = adj ? pick(adj, value.select) : null;
      } else if (key === 'payments') {
        allowOnly(value, ['select']);
        out[key] = paymentsOf(i.id).map((p) => pick(p, value.select));
      } else if (key === 'creditNotes') {
        allowOnly(value, ['where', 'select']);
        out[key] = invoices
          .filter(
            (c) =>
              c.isCreditNote &&
              c.parentInvoiceId === i.id &&
              invoiceMatches(c, value.where ?? {}),
          )
          .map((c) => pick(c, value.select));
      } else {
        Object.assign(out, pick(i, { [key]: value }));
      }
    }
    return out;
  };

  const orderMatches = (o: WorldOrder, w: any): boolean => {
    allowOnly(w, [
      'id',
      'clubId',
      'status',
      'memberId',
      'contactId',
      'fulfilledAt',
      'deliveredAt',
      'OR',
      'adjustments',
    ]);
    if (w.id !== undefined && o.id !== w.id) return false;
    if (w.clubId !== undefined && o.clubId !== w.clubId) return false;
    if (w.status !== undefined && !oneOf(o.status, w.status)) return false;
    if (w.memberId !== undefined && o.memberId !== w.memberId) return false;
    if (w.contactId !== undefined && o.contactId !== w.contactId) return false;
    if (w.fulfilledAt !== undefined && !nullity(o.fulfilledAt, w.fulfilledAt)) return false;
    if (w.deliveredAt !== undefined && !nullity(o.deliveredAt, w.deliveredAt)) return false;
    if (w.OR !== undefined) {
      // Garde « aucun encaissement » (ADR-0019) : sans facture, ou facture
      // sans paiement.
      const inv = mainInvoiceOf(o.id);
      const any = w.OR.some((branch: any) => {
        allowOnly(branch, ['invoice']);
        const is = branch.invoice.is;
        return is === null ? inv === null : inv !== null && invoiceMatches(inv, is);
      });
      if (!any) return false;
    }
    if (w.adjustments !== undefined) {
      if (!same(w.adjustments, { none: PAID_SUPPLEMENT })) {
        throw new Error('clause adjustments non simulée');
      }
      if (paidSupplementsOf(o.id).length > 0) return false;
    }
    return true;
  };

  const lineMatches = (l: WorldLine, w: any): boolean => {
    allowOnly(w, ['id', 'orderId', 'cancelledQty', 'awaitingStockQty']);
    return (
      (w.id === undefined || l.id === w.id) &&
      (w.orderId === undefined || l.orderId === w.orderId) &&
      count(l.cancelledQty, w.cancelledQty) &&
      count(l.awaitingStockQty, w.awaitingStockQty)
    );
  };

  const variantMatches = (v: WorldVariant, w: any): boolean => {
    allowOnly(w, ['id', 'clubId', 'active', 'trackStock', 'onHand', 'available']);
    return (
      (w.id === undefined || v.id === w.id) &&
      (w.clubId === undefined || v.clubId === w.clubId) &&
      (w.active === undefined || v.active === w.active) &&
      (w.trackStock === undefined || v.trackStock === w.trackStock) &&
      count(v.onHand, w.onHand) &&
      count(v.available, w.available)
    );
  };

  const db: any = {
    club: {
      findUnique: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['id']);
        return clone(clubs.find((c) => c.id === where.id) ?? null);
      }),
    },
    shopOrder: {
      findFirst: jest.fn(async ({ where, include, select }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return null;
        const row: Record<string, any> = clone(o);
        const relations = { ...(include ?? {}), ...(select ?? {}) };
        if (relations.invoice) {
          const inv = mainInvoiceOf(o.id);
          row.invoice = inv
            ? { id: inv.id, payments: paymentsOf(inv.id).map((p) => ({ id: p.id })) }
            : null;
        }
        if (relations.club) {
          row.club = pick(clubs.find((c) => c.id === o.clubId)!, relations.club.select);
        }
        // Aucunes CGV dans ce monde.
        if (relations.termsAsset) row.termsAsset = null;
        if (relations.adjustments) {
          if (!same(relations.adjustments.where, PAID_SUPPLEMENT)) {
            throw new Error('clause adjustments non simulée');
          }
          row.adjustments = paidSupplementsOf(o.id)
            .slice(0, relations.adjustments.take)
            .map((a) => ({ id: a.id }));
        }
        return row;
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) throw new Error('commande introuvable');
        return clone(o);
      }),
      findMany: jest.fn(async ({ where, orderBy }: any) => {
        allowOnly(where, ['clubId', 'memberId', 'contactId']);
        expect(orderBy).toEqual([{ createdAt: 'desc' }]);
        return orders
          .filter((o) => orderMatches(o, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((o) => clone(o));
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        for (const o of hit) write(o, data);
        return { count: hit.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        allowOnly(data, ['deliveredLines', 'totalCents']);
        const o = orders.find((x) => x.id === where.id);
        if (!o) throw new Error('commande introuvable');
        write(o, data);
        return clone(o);
      }),
    },
    shopOrderLine: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.flatMap((o) => o.lines).filter((l) => lineMatches(l, where));
        for (const l of hit) write(l, data);
        return { count: hit.length };
      }),
      create: jest.fn(async ({ data }: any) => {
        allowOnly(data, ['orderId', 'productId', 'variantId', 'quantity', 'unitPriceCents', 'label']);
        const order = orders.find((o) => o.id === data.orderId);
        if (!order) throw new Error('commande introuvable');
        const line: WorldLine = {
          id: uid('line'),
          awaitingStockQty: 0,
          cancelledQty: 0,
          createdAt: new Date(),
          ...data,
        };
        order.lines.push(line);
        return clone(line);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        allowOnly(data, ['awaitingStockQty']);
        const line = orders.flatMap((o) => o.lines).find((l) => l.id === where.id);
        if (!line) throw new Error('ligne introuvable');
        write(line, data);
        return clone(line);
      }),
    },
    shopProductVariant: {
      findFirst: jest.fn(async ({ where, include, select }: any) => {
        const v = variants.find((x) => variantMatches(x, where));
        if (!v) return null;
        if (select) return pick(v, select);
        const row: Record<string, unknown> = clone(v);
        if (include) {
          allowOnly(include, ['product']);
          const p = products.find((x) => x.id === v.productId);
          row.product = p ? pick(p, include.product.select) : null;
        }
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((v) => variantMatches(v, where));
        for (const v of hit) write(v, data);
        return { count: hit.length };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return { id: uid('mv'), ...data };
      }),
    },
    shopOrderAdjustment: {
      create: jest.fn(async ({ data }: any) => {
        const row: WorldAdjustment = {
          id: uid('adj'),
          createdAt: new Date(),
          refundedCents: 0,
          cardRefundCents: 0,
          writtenOffCents: 0,
          ...data,
        };
        adjustments.push(row);
        return clone(row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        const row = adjustments.find((a) => a.id === where.id);
        if (!row) throw new Error('ajustement introuvable');
        write(row, data);
        return clone(row);
      }),
      findMany: jest.fn(async ({ where, orderBy, select }: any) => {
        allowOnly(where, ['orderId']);
        let hit = adjustments.filter((a) => oneOf(a.orderId, where.orderId));
        if (orderBy !== undefined) {
          expect(orderBy).toEqual({ createdAt: 'asc' });
          hit = [...hit].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        const { supplementInvoice, ...columns } = select;
        return hit.map((a) => {
          const sup = supplementOf(a.id);
          return {
            ...pick(a, columns),
            ...(supplementInvoice
              ? { supplementInvoice: sup ? pick(sup, supplementInvoice.select) : null }
              : {}),
          };
        });
      }),
      findFirst: jest.fn(async ({ where, include }: any) => {
        allowOnly(where, ['id', 'clubId', 'kind', 'signedAt']);
        const a = adjustments.find(
          (x) =>
            (where.id === undefined || x.id === where.id) &&
            (where.clubId === undefined || x.clubId === where.clubId) &&
            (where.kind === undefined || x.kind === where.kind) &&
            (where.signedAt === undefined || nullity(x.signedAt, where.signedAt)),
        );
        if (!a) return null;
        const row: Record<string, unknown> = clone(a);
        if (include) {
          allowOnly(include, ['order']);
          const o = orders.find((x) => x.id === a.orderId)!;
          const { club, ...columns } = include.order.select;
          row.order = {
            ...pick(o, columns),
            ...(club ? { club: pick(clubs.find((c) => c.id === o.clubId)!, club.select) } : {}),
          };
        }
        return row;
      }),
    },
    invoice: {
      findFirst: jest.fn(async ({ where, select }: any) => {
        const i = invoices.find((x) => invoiceMatches(x, where));
        if (!i) return null;
        return select ? projectInvoice(i, select) : clone(i);
      }),
      findMany: jest.fn(async ({ where, include, select, orderBy }: any) => {
        let hit = invoices.filter((i) => invoiceMatches(i, where));
        if (orderBy !== undefined) {
          expect(orderBy).toEqual({ createdAt: 'asc' });
          hit = [...hit].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (include) {
          allowOnly(include, ['payments']);
          return hit.map((i) => ({ ...clone(i), payments: paymentsWithCheques(i.id) }));
        }
        return hit.map((i) => (select ? projectInvoice(i, select) : clone(i)));
      }),
      count: jest.fn(
        async ({ where }: any) => invoices.filter((i) => invoiceMatches(i, where)).length,
      ),
      aggregate: jest.fn(async ({ where }: any) => {
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        return {
          _sum: {
            amountCents: hit.length ? hit.reduce((s, i) => s + i.amountCents, 0) : null,
          },
        };
      }),
      create: jest.fn(async ({ data, select }: any) => {
        const row: WorldInvoice = {
          id: uid(data.isCreditNote ? 'cn' : 'inv'),
          shopOrderId: null,
          shopAdjustmentId: null,
          voidReason: null,
          isCreditNote: false,
          parentInvoiceId: null,
          createdAt: new Date(),
          ...data,
        };
        invoices.push(row);
        return select ? pick(row, select) : clone(row);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        for (const i of hit) write(i, data);
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
        const row: WorldPayment = {
          id: uid('pay'),
          externalRef: null,
          refundedPaymentId: null,
          createdAt: new Date(),
          ...data,
        };
        payments.push(row);
        return clone(row);
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
        for (const c of hit) write(c, data);
        return { count: hit.length };
      }),
    },
    member: {
      findMany: jest.fn(async ({ where, select }: any) => {
        allowOnly(where, ['id']);
        return members.filter((m) => oneOf(m.id, where.id)).map((m) => pick(m, select));
      }),
      findFirst: jest.fn(async ({ where, select }: any) => {
        allowOnly(where, ['id', 'clubId']);
        const m = members.find((x) => x.id === where.id && x.clubId === where.clubId);
        return m ? pick(m, select) : null;
      }),
    },
    contact: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
    },
    familyMember: {
      findFirst: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['memberId', 'family']);
        const f = families.find(
          (x) => x.memberId === where.memberId && x.clubId === where.family.clubId,
        );
        return f ? { familyId: f.familyId } : null;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = clone({
        orders,
        variants,
        invoices,
        payments,
        cheques,
        movements,
        adjustments,
      });
      depth += 1;
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
        restore(adjustments, snap.adjustments);
        events.push('rollback');
        throw e;
      } finally {
        depth -= 1;
      }
    }),
  };

  const trace = <A extends unknown[], R>(name: string, impl: (...args: A) => Promise<R>) =>
    jest.fn(async (...args: A) => {
      events.push(name);
      return impl(...args);
    });

  const preorders = {
    allocateQuietly: trace(
      'allocate',
      async (_clubId: string, _variantIds: Iterable<string>) => undefined,
    ),
  };
  const stock = new ShopStockService(db);
  const shop = new ShopService(db, stock, {} as never, preorders as never);
  const accounting = {
    createContraEntryForCreditNote: trace(
      'accounting',
      async (
        _clubId: string,
        _creditNoteId: string,
        _sourcePaymentId?: string | null,
        _refundFinancialAccountId?: string | null,
      ) => undefined,
    ),
  };
  const creditNotes = new CreditNotesService(db, accounting as never);
  const stripeRefunds = {
    refundPayment: trace(
      'stripe',
      async (args: { paymentId: string; amountCents?: number | null }) => ({
        refundId: 're_1',
        amountCents:
          args.amountCents ??
          payments.find((p) => p.id === args.paymentId)?.amountCents ??
          0,
      }),
    ),
  };
  const scheduleEngine = {
    sumInFlightForInvoice: jest.fn(async (_invoiceId: string) => 0),
    closeScheduleForInvoice: trace(
      'schedule',
      async (_invoiceId: string, _status: InvoiceStatus) => undefined,
    ),
  };
  const stripeCheckout = {
    expireCheckoutSessionForInvoice: trace(
      'expire',
      async (_clubId: string, _invoiceId: string) => 'expired' as const,
    ),
  };
  const financialAccounts = {
    getDefault: jest.fn(async (_clubId: string, _kind: string) =>
      seed.clubBankId === null ? null : { id: seed.clubBankId ?? 'fa-banque-club' },
    ),
  };
  const money = new ShopOrderMoneyService(
    db,
    creditNotes,
    stripeRefunds as never,
    scheduleEngine as never,
    stripeCheckout as never,
    financialAccounts as never,
  );
  const refunds = new ShopOrderRefundsService(db, shop, money, preorders as never);
  const adjust = new ShopOrderAdjustmentsService(db, shop, money, preorders as never);

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
    db,
    shop,
    stock,
    money,
    refunds,
    adjust,
    orders,
    variants,
    products,
    invoices,
    payments,
    cheques,
    movements,
    adjustments,
    events,
    preorders,
    accounting,
    stripeRefunds,
    scheduleEngine,
    stripeCheckout,
    financialAccounts,
    meanwhile,
    /** Transactions ouvertes à cet instant : 0 hors de toute transaction. */
    txDepth: () => depth,
    creditNotesOf: () => invoices.filter((i) => i.isCreditNote),
    refundsOf: () => payments.filter((p) => p.amountCents < 0),
  };
}

export type World = ReturnType<typeof makeWorld>;
