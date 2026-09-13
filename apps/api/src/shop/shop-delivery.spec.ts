import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  ShopOrderStatus,
  ShopStockMovementKind,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Remise signée et sortie de stock à la première des deux actions (ADR-0017).
 *
 * Vrais `ShopService` et `ShopStockService` ; seul Prisma est doublé. Le double
 * applique TOUTES les clauses présentes du `where` — y compris `null` et
 * `{ not: null }` — et annule les écritures d'une transaction qui lève, comme
 * PostgreSQL. C'est ce qui fait mordre les tests d'idempotence : retirer
 * `fulfilledAt: null` d'une écriture fait sortir le stock deux fois, et un
 * test le constate.
 */

/**
 * En-tête PNG valide (les 8 octets de signature du format). La remise ne décode
 * pas l'image ; le bon de livraison, lui, sait survivre à une image abîmée —
 * cf. shop-delivery-note-pdf.service.spec.ts.
 */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

type OrderRow = {
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
  termsAssetId: string | null;
  termsAcceptedAt: Date | null;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  deliveredByUserId: string | null;
  deliverySignerName: string | null;
  deliverySignaturePng: string | null;
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

type InvoiceRow = {
  id: string;
  clubId: string;
  shopOrderId: string;
  status: InvoiceStatus;
};

/** Clause Prisma sur une colonne nullable : absente, `null`, `{ not: null }`. */
function nullableMatches(value: unknown, clause: unknown): boolean {
  if (clause === undefined) return true;
  if (clause === null) return value === null;
  if (typeof clause === 'object' && clause !== null && 'not' in clause) {
    return (clause as { not: unknown }).not === null
      ? value !== null
      : value !== (clause as { not: unknown }).not;
  }
  return value === clause;
}

function makeStore(seed: {
  orders: OrderRow[];
  onHand?: number;
  available?: number;
  clubTerms?: string | null;
  invoices?: InvoiceRow[];
}) {
  const orders = seed.orders;
  const invoices = seed.invoices ?? [];
  const variant = {
    id: 'v-1',
    clubId: 'club-1',
    trackStock: true,
    onHand: seed.onHand ?? 5,
    available: seed.available ?? 3,
  };
  const clubs = [
    {
      id: 'club-1',
      name: 'Dojo Test',
      siret: null,
      address: '1 rue du Dojo',
      shopTermsAssetId: seed.clubTerms ?? null,
    },
  ];
  const assets = [
    { id: 'cgv-v1', fileName: 'cgv-v1.pdf' },
    { id: 'cgv-v2', fileName: 'cgv-v2.pdf' },
  ];
  const members = [{ id: 'm-1', firstName: 'Camillah', lastName: 'ABDILLAH' }];
  const movements: Array<Record<string, unknown>> = [];

  const orderMatches = (o: OrderRow, where: any): boolean =>
    (where.id === undefined || o.id === where.id) &&
    (where.clubId === undefined || o.clubId === where.clubId) &&
    (where.status === undefined ||
      (typeof where.status === 'object'
        ? where.status.in.includes(o.status)
        : o.status === where.status)) &&
    (where.memberId === undefined || o.memberId === where.memberId) &&
    (where.contactId === undefined || o.contactId === where.contactId) &&
    nullableMatches(o.fulfilledAt, where.fulfilledAt) &&
    nullableMatches(o.deliveredAt, where.deliveredAt) &&
    nullableMatches(o.termsAcceptedAt, where.termsAcceptedAt);

  const invoiceMatches = (i: InvoiceRow, where: any): boolean =>
    (where.shopOrderId === undefined || i.shopOrderId === where.shopOrderId) &&
    (where.clubId === undefined || i.clubId === where.clubId) &&
    (where.status === undefined || i.status === where.status);

  const db: any = {
    club: {
      findUnique: jest.fn(
        async ({ where }: any) => clubs.find((c) => c.id === where.id) ?? null,
      ),
    },
    member: {
      findMany: jest.fn(async ({ where }: any) =>
        members.filter((m) => where.id.in.includes(m.id)),
      ),
    },
    contact: { findMany: jest.fn(async () => []) },
    invoice: {
      findFirst: jest.fn(
        async ({ where }: any) =>
          invoices.find((i) => invoiceMatches(i, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        invoices
          .filter((i) => where.shopOrderId.in.includes(i.shopOrderId))
          .map((i) => ({ id: i.id, shopOrderId: i.shopOrderId, status: i.status })),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        hit.forEach((i) => Object.assign(i, data));
        return { count: hit.length };
      }),
    },
    shopOrder: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        hit.forEach((o) => Object.assign(o, data));
        return { count: hit.length };
      }),
      findFirst: jest.fn(async ({ where, include }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return null;
        return {
          ...o,
          lines: o.lines.map((l) => ({ ...l })),
          ...(include?.club
            ? { club: clubs.find((c) => c.id === o.clubId) }
            : {}),
          ...(include?.termsAsset
            ? {
                termsAsset:
                  assets.find((a) => a.id === o.termsAssetId) ?? null,
              }
            : {}),
        };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) throw new Error('order not found');
        return { ...o, lines: o.lines.map((l) => ({ ...l })) };
      }),
    },
    shopProductVariant: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = [variant].filter(
          (v) =>
            (where.id === undefined || v.id === where.id) &&
            (where.clubId === undefined || v.clubId === where.clubId) &&
            (where.trackStock === undefined || v.trackStock === where.trackStock),
        );
        hit.forEach((v) => {
          if (data.onHand?.decrement) v.onHand -= data.onHand.decrement;
          if (data.available?.increment) v.available += data.available.increment;
        });
        return { count: hit.length };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (fn: any) => {
      const snap = {
        orders: structuredClone(orders),
        invoices: structuredClone(invoices),
        variant: { ...variant },
        movements: structuredClone(movements),
      };
      try {
        return await fn(db);
      } catch (e) {
        orders.splice(0, orders.length, ...snap.orders);
        invoices.splice(0, invoices.length, ...snap.invoices);
        movements.splice(0, movements.length, ...snap.movements);
        Object.assign(variant, snap.variant);
        throw e;
      }
    }),
  };

  const stock = new ShopStockService(db as unknown as PrismaService);
  const shop = new ShopService(
    db as unknown as PrismaService,
    stock,
    {} as unknown as ShopPurchaseOrdersService,
  );
  return { db, shop, orders, variant, movements };
}

const ORDER = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'order-1',
  clubId: 'club-1',
  memberId: 'm-1',
  contactId: null,
  status: ShopOrderStatus.PENDING,
  totalCents: 2500,
  note: null,
  createdAt: new Date('2026-09-13T08:00:00Z'),
  updatedAt: new Date('2026-09-13T08:00:00Z'),
  paidAt: null,
  cancelledAt: null,
  termsAssetId: null,
  termsAcceptedAt: null,
  fulfilledAt: null,
  deliveredAt: null,
  deliveredByUserId: null,
  deliverySignerName: null,
  deliverySignaturePng: null,
  lines: [
    {
      id: 'line-1',
      orderId: 'order-1',
      productId: 'p-1',
      variantId: 'v-1',
      quantity: 2,
      unitPriceCents: 1250,
      label: 'Kimono — 120/130',
    },
  ],
  ...over,
});

type Store = ReturnType<typeof makeStore>;

const fulfils = (h: Store) =>
  h.movements.filter((m) => m.kind === ShopStockMovementKind.FULFILL).length;

const deliver = (
  h: Store,
  over: Partial<{ signerName: string; signaturePng: string }> = {},
) =>
  h.shop.deliverOrder('club-1', 'admin-1', {
    orderId: 'order-1',
    signerName: 'Camillah ABDILLAH',
    signaturePng: PNG,
    ...over,
  });

const payByCard = (h: Store) =>
  h.db.$transaction((tx: never) =>
    h.shop.fulfillPaidShopOrderInTx(tx, 'club-1', 'order-1'),
  );

describe('ShopService.deliverOrder — remise signée (ADR-0017)', () => {
  it('fige la preuve de la remise dans la commande', async () => {
    const h = makeStore({ orders: [ORDER()] });
    const avant = Date.now();

    const shaped = await deliver(h);

    const o = h.orders[0];
    expect(o.deliveredAt).toBeInstanceOf(Date);
    expect(o.deliveredAt!.getTime()).toBeGreaterThanOrEqual(avant);
    expect(o.deliveredByUserId).toBe('admin-1');
    expect(o.deliverySignerName).toBe('Camillah ABDILLAH');
    expect(o.deliverySignaturePng).toBe(PNG);
    expect(shaped.deliveredAt).toEqual(o.deliveredAt);
    expect(shaped.deliverySignerName).toBe('Camillah ABDILLAH');
  });

  it('une commande EN ATTENTE sort du stock à la remise : la première des deux actions', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });

    await deliver(h);

    expect(h.variant.onHand).toBe(3);
    expect(h.variant.available).toBe(3); // déjà décompté à la réservation
    expect(fulfils(h)).toBe(1);
    expect(h.orders[0].fulfilledAt).toBeInstanceOf(Date);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING); // pas payée pour autant
  });

  it('remettre PUIS payer : le stock ne sort qu’une fois', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });

    await deliver(h);
    await payByCard(h);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variant.onHand).toBe(3);
    expect(fulfils(h)).toBe(1);
  });

  it('payer PUIS remettre : le stock ne sort qu’une fois', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });

    await payByCard(h);
    expect(fulfils(h)).toBe(1);
    await deliver(h);

    expect(h.variant.onHand).toBe(3);
    expect(fulfils(h)).toBe(1);
    expect(h.orders[0].deliveredAt).toBeInstanceOf(Date);
  });

  it('une commande payée AVANT `fulfilledAt` ne ressort pas à la remise : aucun rattrapage requis', async () => {
    // Payée et sortie sous l'ancien code : PAID, fulfilledAt NULL, et `onHand`
    // déjà décompté à son paiement.
    const h = makeStore({
      orders: [
        ORDER({
          status: ShopOrderStatus.PAID,
          paidAt: new Date('2026-09-01T10:00:00Z'),
        }),
      ],
      onHand: 3,
      available: 3,
    });

    await deliver(h);

    expect(h.variant.onHand).toBe(3);
    expect(fulfils(h)).toBe(0);
    expect(h.orders[0].deliveredAt).toBeInstanceOf(Date);
  });

  it('« Clôturer la commande » après la remise ne ressort pas le stock', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });

    await deliver(h);
    await h.shop.markOrderPaid('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variant.onHand).toBe(3);
    expect(fulfils(h)).toBe(1);
  });

  it('refuse une double remise, sans toucher à la première preuve', async () => {
    const h = makeStore({ orders: [ORDER()] });

    await deliver(h);
    await expect(
      deliver(h, { signerName: 'Quelqu’un d’autre' }),
    ).rejects.toThrow(/déjà été remise/);

    expect(h.orders[0].deliverySignerName).toBe('Camillah ABDILLAH');
    expect(fulfils(h)).toBe(1);
  });

  it('refuse de remettre une commande annulée', async () => {
    const h = makeStore({
      orders: [
        ORDER({ status: ShopOrderStatus.CANCELLED, cancelledAt: new Date() }),
      ],
    });

    await expect(deliver(h)).rejects.toThrow(/annulée/);

    expect(h.orders[0].deliveredAt).toBeNull();
    expect(fulfils(h)).toBe(0);
  });

  it('ne remet pas la commande d’un autre club', async () => {
    const h = makeStore({ orders: [ORDER({ clubId: 'club-2' })] });

    await expect(deliver(h)).rejects.toThrow(NotFoundException);

    expect(h.orders[0].deliveredAt).toBeNull();
  });

  it.each([
    ['un nom vide', { signerName: '   ' }],
    ['une image qui n’est pas un PNG', { signaturePng: 'data:image/jpeg;base64,AAAA' }],
    [
      'un base64 qui se dit PNG sans en être un',
      { signaturePng: 'data:image/png;base64,AAAAAAAAAAAAAAAA' },
    ],
    [
      'une signature démesurée',
      { signaturePng: `data:image/png;base64,${'A'.repeat(400_000)}` },
    ],
  ])('refuse %s, sans rien écrire', async (_label, over) => {
    const h = makeStore({ orders: [ORDER()] });

    await expect(deliver(h, over)).rejects.toThrow(BadRequestException);

    expect(h.orders[0].deliveredAt).toBeNull();
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it('CGV : la signature porte l’acceptation d’une commande qui n’en avait aucune', async () => {
    const h = makeStore({ orders: [ORDER()], clubTerms: 'cgv-v2' });

    await deliver(h);

    expect(h.orders[0].termsAssetId).toBe('cgv-v2');
    expect(h.orders[0].termsAcceptedAt).toEqual(h.orders[0].deliveredAt);
  });

  it('CGV : une acceptation donnée à la commande reste celle qui fait foi', async () => {
    const acceptee = new Date('2026-09-10T09:00:00Z');
    const h = makeStore({
      orders: [ORDER({ termsAssetId: 'cgv-v1', termsAcceptedAt: acceptee })],
      clubTerms: 'cgv-v2',
    });

    await deliver(h);

    expect(h.orders[0].termsAssetId).toBe('cgv-v1');
    expect(h.orders[0].termsAcceptedAt).toEqual(acceptee);
  });

  it('sans CGV en ligne, la remise n’invente aucune acceptation', async () => {
    const h = makeStore({ orders: [ORDER()], clubTerms: null });

    await deliver(h);

    expect(h.orders[0].termsAssetId).toBeNull();
    expect(h.orders[0].termsAcceptedAt).toBeNull();
  });
});

describe('une commande remise ne s’annule plus (ADR-0017)', () => {
  it('ni par le club : refus explicite, et le stock vendable ne remonte pas', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });
    await deliver(h);

    await expect(h.shop.cancelOrder('club-1', 'order-1')).rejects.toThrow(
      /déjà été remise/,
    );

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variant.available).toBe(3);
  });

  it('ni par l’adhérent', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });
    await deliver(h);

    await expect(
      h.shop.cancelOrderForViewer(
        'club-1',
        { memberId: 'm-1', contactId: null },
        'order-1',
      ),
    ).rejects.toThrow(/déjà été remise/);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variant.available).toBe(3);
  });

  it('une commande non remise s’annule toujours, et libère sa réservation', async () => {
    const h = makeStore({ orders: [ORDER()], onHand: 5, available: 3 });

    await h.shop.cancelOrder('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variant.available).toBe(5);
  });
});

describe('ShopService.getDeliveryNote', () => {
  it('rien tant que la commande n’est pas remise', async () => {
    const h = makeStore({ orders: [ORDER()] });

    await expect(h.shop.getDeliveryNote('club-1', 'order-1')).resolves.toBeNull();
  });

  it('rend les données figées à la remise, signature décodée', async () => {
    const acceptee = new Date('2026-09-10T09:00:00Z');
    const h = makeStore({
      orders: [ORDER({ termsAssetId: 'cgv-v1', termsAcceptedAt: acceptee })],
    });
    await deliver(h);

    const note = await h.shop.getDeliveryNote('club-1', 'order-1');

    expect(note).not.toBeNull();
    expect(note!.order.reference).toBe('CMD-ORDER-1');
    expect(note!.order.paid).toBe(false);
    expect(note!.buyerName).toBe('Camillah ABDILLAH');
    expect(note!.delivery.signerName).toBe('Camillah ABDILLAH');
    expect(note!.delivery.signaturePng.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(note!.terms).toEqual({ fileName: 'cgv-v1.pdf', acceptedAt: acceptee });
  });

  it('ne rend pas le bon d’une commande d’un autre club', async () => {
    const h = makeStore({ orders: [ORDER()] });
    await deliver(h);

    await expect(h.shop.getDeliveryNote('club-2', 'order-1')).resolves.toBeNull();
  });
});
