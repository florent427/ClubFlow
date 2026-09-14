import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  ShopOrderAdjustmentKind,
  ShopOrderStatus,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';
import { ViewerService } from '../viewer/viewer.service';
import type { StripeCheckoutService } from '../payments/stripe-checkout.service';

/**
 * Reprise de paiement (`viewerRepayShopOrder`) et annulation viewer
 * (`viewerCancelShopOrder` → `ShopService.cancelOrderForViewer`), y compris le
 * reste à payer d'un échange (ADR-0020).
 *
 * Le double Prisma SIMULE PostgreSQL : `updateMany` n'applique la donnée
 * qu'aux lignes satisfaisant TOUTES les conditions du `where`, renvoie le
 * `count` réel, et `$transaction` fait un ROLLBACK réel si le corps lève. Il
 * lève sur toute clause qu'il ne sait pas simuler. Sans ça, retirer le scope
 * d'appartenance du WHERE ne changerait QUE la forme et les tests resteraient
 * verts (cf. pitfalls/test-verifie-la-forme-pas-le-comportement.md). Ici, un
 * prédicat qui ne mord pas fait échouer l'assertion : le double mord.
 */

type LineRow = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  label: string;
  awaitingStockQty: number;
  /** Unités retirées de la commande (ADR-0020). */
  cancelledQty: number;
};

type OrderRow = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  status: ShopOrderStatus;
  totalCents: number;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** ADR-0017 : absentes des lignes anciennes, elles valent NULL. */
  fulfilledAt?: Date | null;
  deliveredAt?: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: LineRow[];
};

type VariantRow = {
  id: string;
  clubId: string;
  trackStock: boolean;
  available: number;
  onHand: number;
};

type InvoiceRow = {
  id: string;
  clubId: string;
  shopOrderId: string | null;
  /** Facture du reste à payer d'un échange (ADR-0020). */
  shopAdjustmentId: string | null;
  status: InvoiceStatus;
  voidReason: string | null;
  amountCents: number;
  createdAt: Date;
  isCreditNote: boolean;
  /** Encaissements portés par la facture (ADR-0019). */
  payments?: Array<{ id: string; amountCents: number }>;
  /** Avoirs émis sur la facture (ADR-0011). */
  creditNotes?: Array<{ amountCents: number; status: InvoiceStatus }>;
};

/** Échange ou annulation d'article d'une commande (ADR-0020). */
type AdjustmentRow = {
  id: string;
  orderId: string;
  kind: ShopOrderAdjustmentKind;
  createdAt: Date;
  reason: string;
  returnedLabel: string;
  returnedQty: number;
  newLabel: string | null;
  newQty: number | null;
  differenceCents: number;
  refundedCents: number;
  cardRefundCents: number;
  writtenOffCents: number;
  signedAt: Date | null;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Échanges dont la facture du reste à payer porte un encaissement. */
const PAID_SUPPLEMENT = { supplementInvoice: { is: { payments: { some: {} } } } };

/** Égalité, ou `{ in: [...] }`. */
function oneOf(value: unknown, clause: any): boolean {
  if (clause !== null && typeof clause === 'object') {
    if (!same(Object.keys(clause), ['in'])) {
      throw new Error(`clause non simulée : ${Object.keys(clause).join(', ')}`);
    }
    return clause.in.includes(value);
  }
  return value === clause;
}

function makeStore(opts: {
  orders: OrderRow[];
  variants: VariantRow[];
  invoices: InvoiceRow[];
  adjustments?: AdjustmentRow[];
  thresholdCents?: number | null;
}) {
  const orders = opts.orders;
  const variants = opts.variants;
  const invoices = opts.invoices;
  const adjustments = opts.adjustments ?? [];
  const movements: Array<Record<string, unknown>> = [];
  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

  /** LA facture de la commande : `shopOrderId` est unique. */
  const invoiceForOrder = (orderId: string) =>
    invoices.find((i) => i.shopOrderId === orderId) ?? null;
  const supplementOf = (adjustmentId: string) =>
    invoices.find((i) => i.shopAdjustmentId === adjustmentId) ?? null;
  const paidSupplementsOf = (orderId: string) =>
    adjustments.filter(
      (a) =>
        a.orderId === orderId &&
        (supplementOf(a.id)?.payments ?? []).length > 0,
    );

  const ORDER_CLAUSES = new Set([
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
  // Garde « aucun encaissement » (ADR-0019) : commande sans facture, ou
  // facture sans paiement. Chaque branche est appliquée pour de vrai.
  const orderBranchMatches = (o: OrderRow, branch: any): boolean => {
    const keys = Object.keys(branch);
    if (keys.length !== 1 || keys[0] !== 'invoice') {
      throw new Error(`branche OR non simulée : ${keys.join(', ')}`);
    }
    const inv = invoiceForOrder(o.id);
    const is = branch.invoice.is;
    if (is === null) return inv === null;
    return inv !== null && invMatches(inv, is);
  };

  const orderMatches = (o: OrderRow, where: any): boolean => {
    for (const k of Object.keys(where)) {
      if (!ORDER_CLAUSES.has(k)) throw new Error(`clause non simulée : ${k}`);
    }
    if (where.id !== undefined && o.id !== where.id) return false;
    if (where.clubId !== undefined && o.clubId !== where.clubId) return false;
    // `{ in }` : la reprise de paiement accepte aussi une commande payée.
    if (where.status !== undefined && !oneOf(o.status, where.status)) return false;
    if (where.memberId !== undefined && o.memberId !== where.memberId)
      return false;
    if (where.contactId !== undefined && o.contactId !== where.contactId)
      return false;
    // Clauses `null` de l'ADR-0017 : appliquées pour de vrai, une ligne sans la
    // colonne valant NULL.
    if (
      where.fulfilledAt !== undefined &&
      (o.fulfilledAt ?? null) !== where.fulfilledAt
    )
      return false;
    if (
      where.deliveredAt !== undefined &&
      (o.deliveredAt ?? null) !== where.deliveredAt
    )
      return false;
    if (
      where.OR !== undefined &&
      !where.OR.some((branch: any) => orderBranchMatches(o, branch))
    )
      return false;
    // Ni sur le reste à payer d'un échange (ADR-0020).
    if (where.adjustments !== undefined) {
      if (!same(where.adjustments, { none: PAID_SUPPLEMENT })) {
        throw new Error('clause adjustments non simulée');
      }
      if (paidSupplementsOf(o.id).length > 0) return false;
    }
    return true;
  };

  // Les factures d'une commande : la sienne, ou celle du reste à payer de l'un
  // de ses échanges (ADR-0020). Chaque branche est appliquée pour de vrai.
  const invBranchMatches = (i: InvoiceRow, branch: any): boolean => {
    const keys = Object.keys(branch);
    if (same(keys, ['shopOrderId'])) {
      return i.shopOrderId !== null && oneOf(i.shopOrderId, branch.shopOrderId);
    }
    if (
      same(keys, ['shopAdjustment']) &&
      same(Object.keys(branch.shopAdjustment.is), ['orderId'])
    ) {
      const adj = adjustments.find((a) => a.id === i.shopAdjustmentId);
      return adj !== undefined && oneOf(adj.orderId, branch.shopAdjustment.is.orderId);
    }
    throw new Error(`branche OR non simulée : ${keys.join(', ')}`);
  };

  const INVOICE_CLAUSES = new Set([
    'id',
    'clubId',
    'status',
    'shopOrderId',
    'payments',
    'isCreditNote',
    'OR',
  ]);
  const invMatches = (i: InvoiceRow, where: any): boolean => {
    for (const k of Object.keys(where)) {
      if (!INVOICE_CLAUSES.has(k)) throw new Error(`clause non simulée : ${k}`);
    }
    if (where.id !== undefined && i.id !== where.id) return false;
    if (where.clubId !== undefined && i.clubId !== where.clubId) return false;
    if (where.status !== undefined && i.status !== where.status) return false;
    if (
      where.shopOrderId !== undefined &&
      i.shopOrderId !== where.shopOrderId
    )
      return false;
    if (where.isCreditNote !== undefined && i.isCreditNote !== where.isCreditNote)
      return false;
    if (
      where.OR !== undefined &&
      !where.OR.some((branch: any) => invBranchMatches(i, branch))
    )
      return false;
    if (where.payments !== undefined) {
      if (!same(where.payments, { none: {} })) {
        throw new Error('clause payments non simulée');
      }
      if ((i.payments ?? []).length > 0) return false;
    }
    return true;
  };

  /** Ce que le `select` demande d'une facture, relations comprises. */
  const projectInvoice = (i: InvoiceRow, select: any) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (['id', 'shopOrderId', 'status', 'amountCents', 'createdAt'].includes(key)) {
        out[key] = (i as unknown as Record<string, unknown>)[key];
      } else if (key === 'shopAdjustment') {
        const adj = adjustments.find((a) => a.id === i.shopAdjustmentId);
        out[key] = adj ? { orderId: adj.orderId } : null;
      } else if (key === 'payments') {
        out[key] = (i.payments ?? []).map((p) => ({ amountCents: p.amountCents }));
      } else if (key === 'creditNotes') {
        // Seuls les avoirs non annulés comptent : la clause est appliquée.
        if (!same(select.creditNotes.where, { status: { not: InvoiceStatus.VOID } })) {
          throw new Error('clause creditNotes non simulée');
        }
        out[key] = (i.creditNotes ?? [])
          .filter((c) => c.status !== InvoiceStatus.VOID)
          .map((c) => ({ amountCents: c.amountCents }));
      } else {
        throw new Error(`champ de facture non simulé : ${key}`);
      }
    }
    return out;
  };

  const vMatches = (r: VariantRow, where: any): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.trackStock !== undefined && r.trackStock !== where.trackStock)
      return false;
    return true;
  };

  const db: any = {
    club: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id !== 'club-1') return null;
        return {
          id: 'club-1',
          shopInstallmentThresholdCents: opts.thresholdCents ?? null,
          name: 'Dojo',
        };
      }),
    },
    member: { findMany: jest.fn(async () => []) },
    contact: { findMany: jest.fn(async () => []) },
    shopOrder: {
      findFirst: jest.fn(async ({ where, select }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return null;
        // Résout les relations quel que soit le `select` : les méthodes ne
        // lisent que `invoice`, `adjustments`, `totalCents` et `status`.
        const inv = invoiceForOrder(o.id);
        let refusal = {};
        if (select?.adjustments) {
          if (!same(select.adjustments.where, PAID_SUPPLEMENT)) {
            throw new Error('clause adjustments non simulée');
          }
          refusal = {
            adjustments: paidSupplementsOf(o.id)
              .slice(0, select.adjustments.take)
              .map((a) => ({ id: a.id })),
          };
        }
        return {
          ...o,
          invoice: inv
            ? { id: inv.id, payments: (inv.payments ?? []).map((p) => ({ id: p.id })) }
            : null,
          ...refusal,
        };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        hit.forEach((o) => {
          if (data.status) o.status = data.status;
          if (data.cancelledAt) o.cancelledAt = data.cancelledAt;
          if (data.paidAt) o.paidAt = data.paidAt;
          if (data.fulfilledAt) o.fulfilledAt = data.fulfilledAt;
        });
        return { count: hit.length };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) throw new Error('order not found');
        return { ...o, lines: o.lines.map((l) => ({ ...l })) };
      }),
    },
    invoice: {
      // Garde de `markOrderPaid` : existe-t-il une facture OUVERTE pour cette
      // commande ? Le double applique toutes les clauses présentes.
      findFirst: jest.fn(async ({ where }: any) => {
        const i = invoices.find((x) => invMatches(x, where));
        return i ? { id: i.id } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = invoices.filter((i) => invMatches(i, where));
        hit.forEach((i) => {
          if (data.status) i.status = data.status;
          if (data.voidReason !== undefined) i.voidReason = data.voidReason;
        });
        return { count: hit.length };
      }),
      // hydrateBuyers et la reprise de paiement : les factures d'une commande,
      // la sienne et celles du reste à payer de ses échanges, avec ce qui y a
      // été encaissé et éteint.
      findMany: jest.fn(async ({ where, select }: any) =>
        invoices
          .filter((i) => invMatches(i, where))
          .map((i) => projectInvoice(i, select)),
      ),
    },
    shopOrderAdjustment: {
      findMany: jest.fn(async ({ where, select, orderBy }: any) => {
        if (!same(Object.keys(where), ['orderId'])) {
          throw new Error(`clause non simulée : ${Object.keys(where).join(', ')}`);
        }
        let rows = adjustments.filter((a) => oneOf(a.orderId, where.orderId));
        if (orderBy !== undefined) {
          expect(orderBy).toEqual({ createdAt: 'asc' });
          rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return rows.map((a) => {
          const out: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (key === 'supplementInvoice') {
              const sup = supplementOf(a.id);
              out[key] = sup ? { id: sup.id, status: sup.status } : null;
            } else if (key in a) {
              out[key] = (a as unknown as Record<string, unknown>)[key];
            } else {
              throw new Error(`champ d’ajustement non simulé : ${key}`);
            }
          }
          return out;
        });
      }),
    },
    shopProductVariant: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((r) => vMatches(r, where));
        hit.forEach((r) => {
          if (data.available?.increment) r.available += data.available.increment;
          if (data.available?.decrement) r.available -= data.available.decrement;
          // Sortie de stock (`fulfill`) : sans cette ligne, le double
          // ignorerait la décrémentation et un « stock sorti » serait certifié
          // quel que soit le code.
          if (data.onHand?.decrement) r.onHand -= data.onHand.decrement;
        });
        return { count: hit.length };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return { ...data, id: uid('mv') };
      }),
    },
    // ROLLBACK réel : un `throw` dans le corps restaure l'état capturé, ce qui
    // rend l'atomicité (et l'idempotence, qui s'appuie dessus) testable.
    $transaction: jest.fn(async (fn: any) => {
      const snap = {
        orders: structuredClone(orders),
        invoices: structuredClone(invoices),
        variants: variants.map((v) => ({
          id: v.id,
          available: v.available,
          onHand: v.onHand,
        })),
        movements: structuredClone(movements),
      };
      try {
        return await fn(db);
      } catch (e) {
        const restore = (arr: any[], snapArr: any[]) => {
          arr.length = 0;
          arr.push(...snapArr);
        };
        restore(orders, snap.orders);
        restore(invoices, snap.invoices);
        restore(movements, snap.movements);
        for (const s of snap.variants) {
          const v = variants.find((x) => x.id === s.id);
          if (v) {
            v.available = s.available;
            v.onHand = s.onHand;
          }
        }
        throw e;
      }
    }),
  };

  const purchases = {
    onOrderByVariant: jest.fn().mockResolvedValue(new Map()),
  };
  const stock = new ShopStockService(db as unknown as PrismaService);
  const shop = new ShopService(
    db as unknown as PrismaService,
    stock,
    purchases as unknown as ShopPurchaseOrdersService,
    { allocateQuietly: jest.fn() } as never,
  );

  return { db, shop, orders, variants, invoices, movements };
}

/** Instancie ViewerService sans son lourd constructeur : seuls `prisma` et
 * `stripeCheckout` sont touchés par `viewerRepayShopOrder`. */
function makeViewer(
  db: unknown,
  stripeCheckout: Partial<StripeCheckoutService>,
) {
  const svc = Object.create(ViewerService.prototype) as ViewerService;
  (svc as any).prisma = db;
  (svc as any).stripeCheckout = stripeCheckout;
  return svc;
}

const LINE = (over: Partial<LineRow> = {}): LineRow => ({
  id: 'line-1',
  orderId: 'order-1',
  productId: 'p-1',
  variantId: 'v-1',
  quantity: 2,
  unitPriceCents: 2000,
  label: 'T-shirt — L',
  awaitingStockQty: 0,
  cancelledQty: 0,
  ...over,
});

const ORDER = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'order-1',
  clubId: 'club-1',
  memberId: 'm-1',
  contactId: null,
  status: ShopOrderStatus.PENDING,
  totalCents: 4000,
  paidAt: null,
  cancelledAt: null,
  cancelReason: null,
  note: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  lines: [LINE()],
  ...over,
});

const VARIANT = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'v-1',
  clubId: 'club-1',
  trackStock: true,
  available: 3, // 2 réservés sur un onHand de 5
  onHand: 5,
  ...over,
});

const INVOICE = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: 'inv-1',
  clubId: 'club-1',
  shopOrderId: 'order-1',
  shopAdjustmentId: null,
  status: InvoiceStatus.OPEN,
  voidReason: null,
  amountCents: 4000,
  createdAt: new Date('2026-01-01'),
  isCreditNote: false,
  ...over,
});

/** La facture du reste à payer de l'échange `adj-1` (ADR-0020). */
const SUPPLEMENT = (over: Partial<InvoiceRow> = {}): InvoiceRow =>
  INVOICE({
    id: 'inv-sup',
    shopOrderId: null,
    shopAdjustmentId: 'adj-1',
    amountCents: 1500,
    createdAt: new Date('2026-01-05'),
    ...over,
  });

const ADJUSTMENT = (over: Partial<AdjustmentRow> = {}): AdjustmentRow => ({
  id: 'adj-1',
  orderId: 'order-1',
  kind: ShopOrderAdjustmentKind.EXCHANGE,
  createdAt: new Date('2026-01-05'),
  reason: 'Taille trop petite',
  returnedLabel: 'T-shirt — L',
  returnedQty: 1,
  newLabel: 'T-shirt — XL',
  newQty: 1,
  differenceCents: 1500,
  refundedCents: 0,
  cardRefundCents: 0,
  writtenOffCents: 0,
  signedAt: null,
  ...over,
});

const MEMBER = { memberId: 'm-1', contactId: null };

const stripeOk = () => ({
  createInvoiceCheckoutSession: jest.fn(async () => ({
    url: 'https://checkout.stripe.test/sess_1',
    sessionId: 'sess_1',
    // Nouveau contrat : `createInvoiceCheckoutSession` renvoie directement
    // `paymentReturnUrl` (l'URL à surveiller — https web ou lien profond).
    paymentReturnUrl: 'http://localhost:5174/boutique?club=dojo&paid=1',
  })),
});

// ---------------------------------------------------------------------------
// viewerCancelShopOrder → ShopService.cancelOrderForViewer
// ---------------------------------------------------------------------------

describe('cancelOrderForViewer — annulation viewer', () => {
  it('annule une commande PENDING du viewer, LIBÈRE le stock et VOID la facture', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE()],
    });

    const res = await h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1');

    expect(res.status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    // Stock rendu : available 3 → 5 (2 réservés relâchés), onHand intact.
    expect(h.variants[0].available).toBe(5);
    expect(h.variants[0].onHand).toBe(5);
    // Facture soldée en VOID, pas laissée OPEN.
    expect(h.invoices[0].status).toBe(InvoiceStatus.VOID);
    expect(h.invoices[0].voidReason).toBe('Commande annulée par le membre.');
  });

  it('IDEMPOTENT : réannuler ne relâche PAS le stock une seconde fois', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE()],
    });

    await h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1');
    expect(h.variants[0].available).toBe(5);

    // 2e appel : la commande n'est plus PENDING, updateMany count=0, on
    // n'atteint jamais la libération. Le refus est explicite.
    await expect(
      h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1'),
    ).rejects.toThrow(BadRequestException);

    expect(h.variants[0].available).toBe(5); // pas de double libération
    expect(
      h.movements.filter((m) => (m as any).kind === 'RELEASE'),
    ).toHaveLength(1);
  });

  it('n’annule PAS la commande d’un AUTRE viewer (appartenance dans le WHERE)', async () => {
    const h = makeStore({
      orders: [ORDER({ memberId: 'm-1' })],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE()],
    });

    await expect(
      h.shop.cancelOrderForViewer(
        'club-1',
        { memberId: 'm-2', contactId: null },
        'order-1',
      ),
    ).rejects.toThrow(NotFoundException);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING); // intacte
    expect(h.variants[0].available).toBe(3); // rien relâché
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN); // facture intacte
  });

  it('n’annule PAS la commande d’un AUTRE club', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE()],
    });

    await expect(
      h.shop.cancelOrderForViewer('club-2', MEMBER, 'order-1'),
    ).rejects.toThrow(NotFoundException);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
  });

  it('refuse d’annuler une commande DÉJÀ PAYÉE en le disant (pas de silence)', async () => {
    const h = makeStore({
      orders: [ORDER({ status: ShopOrderStatus.PAID })],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.PAID })],
    });

    await expect(
      h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1'),
    ).rejects.toThrow(/déjà payée/);

    expect(h.variants[0].available).toBe(3); // rien relâché
  });
});

// ---------------------------------------------------------------------------
// viewerRepayShopOrder (ViewerService)
// ---------------------------------------------------------------------------

describe('viewerRepayShopOrder — reprise de paiement', () => {
  it('crée une nouvelle session sur la facture EXISTANTE, sans recréer commande/facture', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    const res = await viewer.viewerRepayShopOrder({
      clubId: 'club-1',
      activeProfile: MEMBER,
      orderId: 'order-1',
      wantsInstallments: false,
    });

    expect(res.orderId).toBe('order-1');
    expect(res.invoiceId).toBe('inv-1');
    expect(res.totalCents).toBe(4000);
    expect(res.installmentsCount).toBe(1);
    expect(res.stripeCheckoutUrl).toBe('https://checkout.stripe.test/sess_1');
    // Contrat mobile : l'URL de succès réellement posée sur la session.
    expect(res.paymentReturnUrl).toBe(
      'http://localhost:5174/boutique?club=dojo&paid=1',
    );
    // La session vise la facture existante, pas une nouvelle.
    expect(stripe.createInvoiceCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-1', clubId: 'club-1' }),
    );
    // Rien recréé : toujours 1 commande, 1 facture, aucune réservation touchée.
    expect(h.orders).toHaveLength(1);
    expect(h.invoices).toHaveLength(1);
    expect(h.variants[0].available).toBe(3);
    expect(h.movements).toHaveLength(0);
  });

  it('refuse de reprendre le paiement d’une commande d’un AUTRE viewer', async () => {
    const h = makeStore({
      orders: [ORDER({ memberId: 'm-1' })],
      variants: [VARIANT()],
      invoices: [INVOICE()],
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    await expect(
      viewer.viewerRepayShopOrder({
        clubId: 'club-1',
        activeProfile: { memberId: 'm-2', contactId: null },
        orderId: 'order-1',
        wantsInstallments: false,
      }),
    ).rejects.toThrow(NotFoundException);

    // Aucune session Stripe n'a été ouverte pour un tiers.
    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuse de reprendre une commande payée sans rien de dû, en le disant', async () => {
    const h = makeStore({
      orders: [ORDER({ status: ShopOrderStatus.PAID })],
      variants: [VARIANT()],
      invoices: [INVOICE({ status: InvoiceStatus.PAID })],
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    await expect(
      viewer.viewerRepayShopOrder({
        clubId: 'club-1',
        activeProfile: MEMBER,
        orderId: 'order-1',
        wantsInstallments: false,
      }),
    ).rejects.toThrow(/déjà payée/);

    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it('refuse de reprendre une commande ANNULÉE en le disant', async () => {
    const h = makeStore({
      orders: [ORDER({ status: ShopOrderStatus.CANCELLED })],
      variants: [VARIANT()],
      invoices: [INVOICE({ status: InvoiceStatus.VOID })],
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    await expect(
      viewer.viewerRepayShopOrder({
        clubId: 'club-1',
        activeProfile: MEMBER,
        orderId: 'order-1',
        wantsInstallments: false,
      }),
    ).rejects.toThrow(/déjà annulée/);
  });

  it('REFUSE le 3× sous le seuil du club (arbitrage serveur, pas le client)', async () => {
    const h = makeStore({
      orders: [ORDER({ totalCents: 4000 })],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      thresholdCents: 10_000, // total 4000 < seuil
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    await expect(
      viewer.viewerRepayShopOrder({
        clubId: 'club-1',
        activeProfile: MEMBER,
        orderId: 'order-1',
        wantsInstallments: true,
      }),
    ).rejects.toThrow(BadRequestException);

    // Refus AVANT toute session Stripe.
    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it('REFUSE le 3× quand le seuil est null (3× désactivé)', async () => {
    const h = makeStore({
      orders: [ORDER({ totalCents: 50_000 })],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      thresholdCents: null,
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    await expect(
      viewer.viewerRepayShopOrder({
        clubId: 'club-1',
        activeProfile: MEMBER,
        orderId: 'order-1',
        wantsInstallments: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it('ACCORDE le 3× quand le total atteint le seuil', async () => {
    const h = makeStore({
      orders: [ORDER({ totalCents: 12_000 })],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      thresholdCents: 10_000,
    });
    const stripe = stripeOk();
    const viewer = makeViewer(h.db, stripe as any);

    const res = await viewer.viewerRepayShopOrder({
      clubId: 'club-1',
      activeProfile: MEMBER,
      orderId: 'order-1',
      wantsInstallments: true,
    });

    expect(res.installmentsCount).toBe(3);
    expect(stripe.createInvoiceCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ installmentsCount: 3 }),
    );
  });
});

describe('viewerRepayShopOrder — le reste à payer d’un échange (ADR-0020)', () => {
  const repay = (
    h: ReturnType<typeof makeStore>,
    stripe: ReturnType<typeof stripeOk>,
  ) =>
    makeViewer(h.db, stripe as any).viewerRepayShopOrder({
      clubId: 'club-1',
      activeProfile: MEMBER,
      orderId: 'order-1',
      wantsInstallments: false,
    });

  /** La facture de la commande, réglée. */
  const PAYEE = () =>
    INVOICE({
      status: InvoiceStatus.PAID,
      payments: [{ id: 'pay-1', amountCents: 4000 }],
    });

  it('commande payée : la session vise la facture du reste à payer', async () => {
    const h = makeStore({
      orders: [ORDER({ status: ShopOrderStatus.PAID })],
      variants: [VARIANT()],
      invoices: [PAYEE(), SUPPLEMENT()],
      adjustments: [ADJUSTMENT()],
    });
    const stripe = stripeOk();

    const res = await repay(h, stripe);

    expect(res.invoiceId).toBe('inv-sup');
    expect(stripe.createInvoiceCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv-sup', clubId: 'club-1' }),
    );
  });

  it('en attente : la facture de la commande passe avant celle du reste à payer', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      // Le reste à payer en tête : sans l'ordre demandé, il passerait devant.
      invoices: [SUPPLEMENT(), INVOICE()],
      adjustments: [ADJUSTMENT()],
    });

    const res = await repay(h, stripeOk());

    expect(res.invoiceId).toBe('inv-1');
  });

  it('plusieurs restes à payer : le plus récent d’abord', async () => {
    const h = makeStore({
      orders: [ORDER({ status: ShopOrderStatus.PAID })],
      variants: [VARIANT()],
      invoices: [
        PAYEE(),
        SUPPLEMENT({ id: 'inv-sup-ancien' }),
        SUPPLEMENT({
          id: 'inv-sup-recent',
          shopAdjustmentId: 'adj-2',
          createdAt: new Date('2026-01-09'),
        }),
      ],
      adjustments: [
        ADJUSTMENT(),
        ADJUSTMENT({ id: 'adj-2', createdAt: new Date('2026-01-09') }),
      ],
    });

    const res = await repay(h, stripeOk());

    expect(res.invoiceId).toBe('inv-sup-recent');
  });

  it('une facture éteinte par ses encaissements et ses avoirs n’est plus proposée', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [
        INVOICE({
          payments: [{ id: 'pay-1', amountCents: 1000 }],
          creditNotes: [{ amountCents: 3000, status: InvoiceStatus.PAID }],
        }),
        SUPPLEMENT(),
      ],
      adjustments: [ADJUSTMENT()],
    });

    const res = await repay(h, stripeOk());

    expect(res.invoiceId).toBe('inv-sup');
  });

  it('un avoir annulé n’éteint rien', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [
        INVOICE({
          creditNotes: [{ amountCents: 4000, status: InvoiceStatus.VOID }],
        }),
        SUPPLEMENT(),
      ],
      adjustments: [ADJUSTMENT()],
    });

    const res = await repay(h, stripeOk());

    expect(res.invoiceId).toBe('inv-1');
  });

  it('payée, et le reste à payer réglé : refus explicite, aucune session', async () => {
    const h = makeStore({
      orders: [ORDER({ status: ShopOrderStatus.PAID })],
      variants: [VARIANT()],
      invoices: [
        PAYEE(),
        SUPPLEMENT({
          status: InvoiceStatus.PAID,
          payments: [{ id: 'pay-sup', amountCents: 1500 }],
        }),
      ],
      adjustments: [ADJUSTMENT()],
    });
    const stripe = stripeOk();

    await expect(repay(h, stripe)).rejects.toThrow(/déjà payée/);

    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it('ne règle jamais la facture d’une AUTRE commande, ni d’un autre club', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [
        INVOICE({ id: 'inv-autre-commande', shopOrderId: 'order-2' }),
        SUPPLEMENT({ id: 'inv-sup-autre-commande', shopAdjustmentId: 'adj-autre' }),
        SUPPLEMENT({ id: 'inv-sup-autre-club', clubId: 'club-2' }),
      ],
      adjustments: [
        ADJUSTMENT(),
        ADJUSTMENT({ id: 'adj-autre', orderId: 'order-2' }),
      ],
    });
    const stripe = stripeOk();

    await expect(repay(h, stripe)).rejects.toThrow(
      /pas de facture à régler en ligne/,
    );

    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });

  it('en attente, facture déjà réglée : rien à régler, et le dit', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE({ status: InvoiceStatus.PAID })],
    });
    const stripe = stripeOk();

    await expect(repay(h, stripe)).rejects.toThrow(/Rien à régler en ligne/);

    expect(stripe.createInvoiceCheckoutSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markOrderPaid — le raccourci ne court-circuite plus l'encaissement
// ---------------------------------------------------------------------------

describe('markOrderPaid — ne plus marquer payée une facture non encaissée', () => {
  /**
   * « Marquer payée » basculait le statut et sortait le stock sans créer aucun
   * paiement. La commande affichait « Payée », la facture restait « À payer »,
   * et la comptabilité ne recevait rien. Cette méthode n'avait AUCUN test.
   */
  it('REFUSE une commande dont la facture est à encaisser, et ne touche à rien', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
    });

    await expect(h.shop.markOrderPaid('club-1', 'order-1')).rejects.toThrow(
      /encaisser/i,
    );

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].onHand).toBe(5);
    expect(h.movements).toHaveLength(0);
  });

  it('accepte une commande SANS facture, antérieure à la facturation systématique', async () => {
    const h = makeStore({ orders: [ORDER()], variants: [VARIANT()], invoices: [] });

    const res = await h.shop.markOrderPaid('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0].onHand).toBe(3);
    expect(res.invoiceId).toBeNull();
    expect(res.invoiceStatus).toBeNull();
    expect(res.payableOnline).toBe(false);
  });

  it('accepte une commande dont la facture est déjà payée : il ne reste que le stock', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE({ status: InvoiceStatus.PAID })],
    });

    const res = await h.shop.markOrderPaid('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0].onHand).toBe(3);
    // La facture est exposée, pour que l'écran puisse l'ouvrir…
    expect(res.invoiceId).toBe('inv-1');
    expect(res.invoiceStatus).toBe(InvoiceStatus.PAID);
    // …mais une facture payée n'est plus « payable ».
    expect(res.payableOnline).toBe(false);
    expect(res.amountDueCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ADR-0019 — un règlement encaissé ne s'annule pas sans être rendu
// ---------------------------------------------------------------------------

describe('annulation sans remboursement — la garde « aucun encaissement »', () => {
  const ENCAISSEE = () =>
    INVOICE({ payments: [{ id: 'pay-1', amountCents: 1500 }] });

  it('adhérent : refuse une commande dont un acompte est encaissé, sans rien toucher', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [ENCAISSEE()],
    });

    await expect(
      h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1'),
    ).rejects.toThrow(/règlement a déjà été encaissé, adressez-vous au club/);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
    // La facture n'est surtout pas annulée : elle porte un paiement.
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
    expect(h.movements).toHaveLength(0);
  });

  it('adhérent : une commande sans facture reste annulable', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [],
    });

    const res = await h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1');

    expect(res.status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variants[0].available).toBe(5);
  });

  it('club : refuse et renvoie vers « Annuler et rembourser »', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [ENCAISSEE()],
    });

    await expect(h.shop.cancelOrder('club-1', 'order-1')).rejects.toThrow(
      /Annuler et rembourser/,
    );

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
    expect(h.invoices[0].status).toBe(InvoiceStatus.OPEN);
    expect(h.movements).toHaveLength(0);
  });

  it('club : annule une commande sans encaissement, libère le stock et annule la facture', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE()],
    });

    const res = await h.shop.cancelOrder('club-1', 'order-1');

    expect(res.status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variants[0].available).toBe(5);
    // Avant l'ADR-0019, la facture restait OUVERTE derrière une commande
    // annulée : un paiement tardif l'aurait soldée.
    expect(h.invoices[0].status).toBe(InvoiceStatus.VOID);
    expect(h.invoices[0].voidReason).toBe('Commande annulée par le club.');
  });

  it('club : une commande sans facture reste annulable', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [],
    });

    await h.shop.cancelOrder('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variants[0].available).toBe(5);
  });
});

describe('annulation — le reste à payer d’un échange (ADR-0020)', () => {
  const ENCAISSE = () =>
    SUPPLEMENT({ payments: [{ id: 'pay-sup', amountCents: 1500 }] });

  it('adhérent : refuse quand le reste à payer est encaissé, sans rien toucher', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE(), ENCAISSE()],
      adjustments: [ADJUSTMENT()],
    });

    await expect(
      h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1'),
    ).rejects.toThrow(/règlement a déjà été encaissé, adressez-vous au club/);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
    expect(h.invoices.map((i) => i.status)).toEqual([
      InvoiceStatus.OPEN,
      InvoiceStatus.OPEN,
    ]);
    expect(h.movements).toHaveLength(0);
  });

  it('club : même garde, et renvoie vers « Annuler et rembourser »', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE(), ENCAISSE()],
      adjustments: [ADJUSTMENT()],
    });

    await expect(h.shop.cancelOrder('club-1', 'order-1')).rejects.toThrow(
      /Annuler et rembourser/,
    );

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.invoices.map((i) => i.status)).toEqual([
      InvoiceStatus.OPEN,
      InvoiceStatus.OPEN,
    ]);
  });

  it('club : le reste à payer jamais encaissé est annulé avec la commande', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE(), SUPPLEMENT()],
      adjustments: [ADJUSTMENT()],
    });

    await h.shop.cancelOrder('club-1', 'order-1');

    expect(h.invoices).toEqual([
      expect.objectContaining({
        id: 'inv-1',
        status: InvoiceStatus.VOID,
        voidReason: 'Commande annulée par le club.',
      }),
      expect.objectContaining({
        id: 'inv-sup',
        status: InvoiceStatus.VOID,
        voidReason: 'Commande annulée par le club.',
      }),
    ]);
  });

  it('adhérent : n’annule que les factures de SA commande', async () => {
    const h = makeStore({
      orders: [ORDER()],
      variants: [VARIANT({ available: 3 })],
      invoices: [
        INVOICE(),
        INVOICE({ id: 'inv-autre', shopOrderId: 'order-2' }),
        SUPPLEMENT({ id: 'inv-sup-autre', shopAdjustmentId: 'adj-autre' }),
      ],
      adjustments: [ADJUSTMENT({ id: 'adj-autre', orderId: 'order-2' })],
    });

    await h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1');

    expect(h.invoices.map((i) => [i.id, i.status])).toEqual([
      ['inv-1', InvoiceStatus.VOID],
      ['inv-autre', InvoiceStatus.OPEN],
      ['inv-sup-autre', InvoiceStatus.OPEN],
    ]);
  });

  it('les unités déjà retirées de la commande ne sont pas libérées une seconde fois', async () => {
    const h = makeStore({
      orders: [ORDER({ lines: [LINE({ quantity: 2, cancelledQty: 1 })] })],
      variants: [VARIANT({ available: 3 })],
      invoices: [INVOICE()],
    });

    await h.shop.cancelOrderForViewer('club-1', MEMBER, 'order-1');

    expect(h.variants[0].available).toBe(4);
    expect(h.movements).toEqual([
      expect.objectContaining({ kind: 'RELEASE', availableDelta: 1 }),
    ]);
  });
});
