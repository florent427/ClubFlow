import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, ShopOrderStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';
import { ViewerService } from '../viewer/viewer.service';
import type { StripeCheckoutService } from '../payments/stripe-checkout.service';

/**
 * Reprise de paiement (`viewerRepayShopOrder`) et annulation viewer
 * (`viewerCancelShopOrder` → `ShopService.cancelOrderForViewer`).
 *
 * Le double Prisma SIMULE PostgreSQL : `updateMany` n'applique la donnée
 * qu'aux lignes satisfaisant TOUTES les conditions du `where`, renvoie le
 * `count` réel, et `$transaction` fait un ROLLBACK réel si le corps lève. Sans
 * ça, retirer le scope d'appartenance du WHERE ne changerait QUE la forme et
 * les tests resteraient verts (cf.
 * pitfalls/test-verifie-la-forme-pas-le-comportement.md). Ici, un prédicat qui
 * ne mord pas fait échouer l'assertion : le double mord.
 */

type OrderRow = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  status: ShopOrderStatus;
  totalCents: number;
  paidAt: Date | null;
  cancelledAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    orderId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    unitPriceCents: number;
    label: string;
  }>;
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
  status: InvoiceStatus;
  voidReason: string | null;
};

function makeStore(opts: {
  orders: OrderRow[];
  variants: VariantRow[];
  invoices: InvoiceRow[];
  thresholdCents?: number | null;
}) {
  const orders = opts.orders;
  const variants = opts.variants;
  const invoices = opts.invoices;
  const movements: Array<Record<string, unknown>> = [];
  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

  const orderMatches = (o: OrderRow, where: any): boolean => {
    if (where.id !== undefined && o.id !== where.id) return false;
    if (where.clubId !== undefined && o.clubId !== where.clubId) return false;
    if (where.status !== undefined && o.status !== where.status) return false;
    if (where.memberId !== undefined && o.memberId !== where.memberId)
      return false;
    if (where.contactId !== undefined && o.contactId !== where.contactId)
      return false;
    return true;
  };

  const invMatches = (i: InvoiceRow, where: any): boolean => {
    if (where.id !== undefined && i.id !== where.id) return false;
    if (where.clubId !== undefined && i.clubId !== where.clubId) return false;
    if (where.status !== undefined && i.status !== where.status) return false;
    if (
      where.shopOrderId !== undefined &&
      i.shopOrderId !== where.shopOrderId
    )
      return false;
    return true;
  };

  const vMatches = (r: VariantRow, where: any): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.trackStock !== undefined && r.trackStock !== where.trackStock)
      return false;
    return true;
  };

  const invoiceForOrder = (orderId: string) =>
    invoices.find((i) => i.shopOrderId === orderId) ?? null;

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
      findFirst: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return null;
        // Résout la relation `invoice` quel que soit le `select` : la méthode
        // ne lit que `o.invoice?.id`, `o.totalCents`, `o.status`.
        const inv = invoiceForOrder(o.id);
        return { ...o, invoice: inv ? { id: inv.id } : null };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        hit.forEach((o) => {
          if (data.status) o.status = data.status;
          if (data.cancelledAt) o.cancelledAt = data.cancelledAt;
          if (data.paidAt) o.paidAt = data.paidAt;
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
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = invoices.filter((i) => invMatches(i, where));
        hit.forEach((i) => {
          if (data.status) i.status = data.status;
          if (data.voidReason !== undefined) i.voidReason = data.voidReason;
        });
        return { count: hit.length };
      }),
    },
    shopProductVariant: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((r) => vMatches(r, where));
        hit.forEach((r) => {
          if (data.available?.increment) r.available += data.available.increment;
          if (data.available?.decrement) r.available -= data.available.decrement;
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

const ORDER = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'order-1',
  clubId: 'club-1',
  memberId: 'm-1',
  contactId: null,
  status: ShopOrderStatus.PENDING,
  totalCents: 4000,
  paidAt: null,
  cancelledAt: null,
  note: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  lines: [
    {
      id: 'line-1',
      orderId: 'order-1',
      productId: 'p-1',
      variantId: 'v-1',
      quantity: 2,
      unitPriceCents: 2000,
      label: 'T-shirt — L',
    },
  ],
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
  status: InvoiceStatus.OPEN,
  voidReason: null,
  ...over,
});

const MEMBER = { memberId: 'm-1', contactId: null };

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
  const stripeOk = () => ({
    createInvoiceCheckoutSession: jest.fn(async () => ({
      url: 'https://checkout.stripe.test/sess_1',
      sessionId: 'sess_1',
      successUrl: 'http://localhost:5174/boutique?club=dojo&paid=1',
    })),
  });

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

  it('refuse de reprendre une commande NON-PENDING en le disant (déjà payée)', async () => {
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
