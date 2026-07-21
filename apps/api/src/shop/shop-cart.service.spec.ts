import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, ShopOrderStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopCartService } from './shop-cart.service';
import { ShopService } from './shop.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Ces tests exercent le panier boutique de bout en bout AVEC les vrais
 * `ShopService` et `ShopStockService` — seul le client Prisma est un double.
 *
 * Le double SIMULE PostgreSQL : `updateMany` n'applique la donnée qu'aux lignes
 * satisfaisant TOUTES les conditions du `where`, et renvoie le `count` réel.
 * C'est ce qui fait mordre les tests : un prédicat qui ne mord sur rien
 * (garantie anti-survente, scoping tenant, transition de statut) fait échouer
 * l'assertion, pas juste changer une forme (cf.
 * pitfalls/test-verifie-la-forme-pas-le-comportement.md).
 */

type VariantRow = {
  id: string;
  clubId: string;
  productId: string;
  active: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  priceCents: number | null;
  label: string | null;
  product: { id: string; name: string; priceCents: number; active: boolean; imageUrl: string | null };
};

type OrderRow = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  status: ShopOrderStatus;
  totalCents: number;
  paidAt: Date | null;
  note: string | null;
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

type CartRow = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
};

type CartItemRow = {
  id: string;
  clubId: string;
  cartId: string;
  variantId: string;
  quantity: number;
  createdAt: Date;
};

type InvoiceRow = {
  id: string;
  clubId: string;
  label: string;
  amountCents: number;
  baseAmountCents: number;
  status: InvoiceStatus;
  installmentsCount: number;
  shopOrderId: string | null;
};

function makeStore(opts: {
  variants: VariantRow[];
  thresholdCents?: number | null;
  clubName?: string;
}) {
  const variants = opts.variants;
  const orders: OrderRow[] = [];
  const carts: CartRow[] = [];
  const items: CartItemRow[] = [];
  const invoices: InvoiceRow[] = [];
  const movements: Array<Record<string, unknown>> = [];
  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

  const vMatches = (r: VariantRow, where: any): boolean => {
    if (where.id !== undefined) {
      if (typeof where.id === 'object' && where.id.in) {
        if (!where.id.in.includes(r.id)) return false;
      } else if (r.id !== where.id) return false;
    }
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.active !== undefined && r.active !== where.active) return false;
    if (where.trackStock !== undefined && r.trackStock !== where.trackStock) return false;
    if (where.available?.gte !== undefined && !(r.available >= where.available.gte)) return false;
    if (where.onHand?.gte !== undefined && !(r.onHand >= where.onHand.gte)) return false;
    if (where.product?.active !== undefined && r.product.active !== where.product.active) return false;
    return true;
  };

  const applyVariant = (r: VariantRow, data: any) => {
    if (data.available?.decrement) r.available -= data.available.decrement;
    if (data.available?.increment) r.available += data.available.increment;
    if (data.onHand?.decrement) r.onHand -= data.onHand.decrement;
    if (data.onHand?.increment) r.onHand += data.onHand.increment;
  };

  // Résout le filtre `cart: { clubId, memberId|contactId }` d'un item.
  const cartMatches = (cartId: string, cartWhere: any): boolean => {
    if (!cartWhere) return true;
    const c = carts.find((x) => x.id === cartId);
    if (!c) return false;
    if (cartWhere.clubId !== undefined && c.clubId !== cartWhere.clubId) return false;
    if (cartWhere.memberId !== undefined && c.memberId !== cartWhere.memberId) return false;
    if (cartWhere.contactId !== undefined && c.contactId !== cartWhere.contactId) return false;
    return true;
  };

  const itemMatches = (r: CartItemRow, where: any): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.cartId !== undefined && r.cartId !== where.cartId) return false;
    if (where.cart !== undefined && !cartMatches(r.cartId, where.cart)) return false;
    return true;
  };

  const db: any = {
    club: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.id !== 'club-1') return null;
        return {
          id: 'club-1',
          shopInstallmentThresholdCents: opts.thresholdCents ?? null,
          name: opts.clubName ?? 'Dojo',
        };
      }),
    },
    shopProductVariant: {
      findMany: jest.fn(async ({ where }: any) => {
        return variants
          .filter((r) => vMatches(r, where))
          .map((r) => ({ ...r, product: { ...r.product } }));
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const r = variants.find((x) => vMatches(x, where));
        return r ? { ...r, product: { ...r.product } } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((r) => vMatches(r, where));
        hit.forEach((r) => applyVariant(r, data));
        return { count: hit.length };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return data;
      }),
    },
    shopOrder: {
      create: jest.fn(async ({ data }: any) => {
        const id = uid('order');
        const row: OrderRow = {
          id,
          clubId: data.clubId,
          memberId: data.memberId ?? null,
          contactId: data.contactId ?? null,
          status: data.status,
          totalCents: data.totalCents,
          paidAt: null,
          note: data.note ?? null,
          lines: (data.lines?.create ?? []).map((l: any) => ({
            id: uid('line'),
            orderId: id,
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            label: l.label,
          })),
        };
        orders.push(row);
        return { ...row, lines: row.lines.map((l) => ({ ...l })) };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter(
          (o) =>
            (where.id === undefined || o.id === where.id) &&
            (where.clubId === undefined || o.clubId === where.clubId) &&
            (where.status === undefined || o.status === where.status),
        );
        hit.forEach((o) => {
          if (data.status) o.status = data.status;
          if (data.paidAt) o.paidAt = data.paidAt;
        });
        return { count: hit.length };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find(
          (x) =>
            x.id === where.id &&
            (where.clubId === undefined || x.clubId === where.clubId),
        );
        if (!o) throw new Error('order not found');
        return { ...o, lines: o.lines.map((l) => ({ ...l })) };
      }),
    },
    invoice: {
      create: jest.fn(async ({ data }: any) => {
        const row: InvoiceRow = {
          id: uid('inv'),
          clubId: data.clubId,
          label: data.label,
          amountCents: data.amountCents,
          baseAmountCents: data.baseAmountCents,
          status: data.status,
          installmentsCount: data.installmentsCount,
          shopOrderId: data.shopOrderId ?? null,
        };
        invoices.push(row);
        return { id: row.id };
      }),
    },
    shopCart: {
      findFirst: jest.fn(async ({ where, include }: any) => {
        const c = carts.find(
          (x) =>
            x.clubId === where.clubId &&
            (where.memberId === undefined || x.memberId === where.memberId) &&
            (where.contactId === undefined || x.contactId === where.contactId),
        );
        if (!c) return null;
        if (include?.items) {
          const its = items
            .filter((i) => i.cartId === c.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((i) => {
              const v = variants.find((x) => x.id === i.variantId)!;
              return {
                ...i,
                variant: include.items.include?.variant
                  ? { ...v, product: { ...v.product } }
                  : undefined,
              };
            });
          return { ...c, items: its };
        }
        return { ...c };
      }),
      create: jest.fn(async ({ data }: any) => {
        const row: CartRow = {
          id: uid('cart'),
          clubId: data.clubId,
          memberId: data.memberId ?? null,
          contactId: data.contactId ?? null,
        };
        carts.push(row);
        return { id: row.id };
      }),
    },
    shopCartItem: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = where.cartId_variantId;
        const ex = items.find(
          (i) => i.cartId === key.cartId && i.variantId === key.variantId,
        );
        if (ex) {
          if (update.quantity?.increment) ex.quantity += update.quantity.increment;
          else if (typeof update.quantity === 'number') ex.quantity = update.quantity;
          return { ...ex };
        }
        const row: CartItemRow = {
          id: uid('item'),
          clubId: create.clubId,
          cartId: create.cartId,
          variantId: create.variantId,
          quantity: create.quantity,
          createdAt: new Date(Date.now() + seq),
        };
        items.push(row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = items.filter((r) => itemMatches(r, where));
        hit.forEach((r) => {
          if (typeof data.quantity === 'number') r.quantity = data.quantity;
        });
        return { count: hit.length };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = items.length;
        for (let i = items.length - 1; i >= 0; i--) {
          if (itemMatches(items[i], where)) items.splice(i, 1);
        }
        return { count: before - items.length };
      }),
    },
    // Transaction avec ROLLBACK réel : sans lui, un `throw` laisserait les
    // écritures partielles en place et rendrait l'atomicité intestable — le
    // « faux Prisma trop plat » explicitement mis en garde. On capture l'état
    // muté avant `fn`, et on le restaure si `fn` lève.
    $transaction: jest.fn(async (fn: any) => {
      const snap = {
        variants: variants.map((v) => ({ id: v.id, available: v.available, onHand: v.onHand })),
        orders: structuredClone(orders),
        invoices: structuredClone(invoices),
        items: structuredClone(items),
        carts: structuredClone(carts),
        movements: structuredClone(movements),
      };
      try {
        return await fn(db);
      } catch (e) {
        for (const s of snap.variants) {
          const v = variants.find((x) => x.id === s.id);
          if (v) {
            v.available = s.available;
            v.onHand = s.onHand;
          }
        }
        const restore = (arr: any[], snapArr: any[]) => {
          arr.length = 0;
          arr.push(...snapArr);
        };
        restore(orders, snap.orders);
        restore(invoices, snap.invoices);
        restore(items, snap.items);
        restore(carts, snap.carts);
        restore(movements, snap.movements);
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
  const cart = new ShopCartService(db as unknown as PrismaService, shop);

  return { cart, shop, stock, db, orders, carts, items, invoices, movements, variants };
}

const VARIANT = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'v-1',
  clubId: 'club-1',
  productId: 'p-1',
  active: true,
  trackStock: true,
  onHand: 5,
  available: 5,
  priceCents: null,
  label: 'L',
  product: { id: 'p-1', name: 'T-shirt', priceCents: 2000, active: true, imageUrl: null },
  ...over,
});

const MEMBER = { memberId: 'm-1', contactId: null };

describe('ShopCartService — panier', () => {
  it('ajoute une déclinaison sans réserver le stock', async () => {
    const h = makeStore({ variants: [VARIANT({ available: 5 })] });

    const view = await h.cart.addItem('club-1', MEMBER, 'v-1', 2);

    expect(view.items).toHaveLength(1);
    expect(view.items[0].quantity).toBe(2);
    expect(view.totalCents).toBe(4000);
    // La garantie de la décision d'archi : AUCUNE réservation à l'ajout.
    expect(h.variants[0].available).toBe(5);
    expect(h.movements).toHaveLength(0);
  });

  it('CUMULE la quantité quand on ré-ajoute la même déclinaison', async () => {
    const h = makeStore({ variants: [VARIANT({ available: 5 })] });
    await h.cart.addItem('club-1', MEMBER, 'v-1', 2);
    const view = await h.cart.addItem('club-1', MEMBER, 'v-1', 1);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].quantity).toBe(3);
  });

  it('refuse d’ajouter un article épuisé', async () => {
    const h = makeStore({ variants: [VARIANT({ available: 0 })] });
    await expect(h.cart.addItem('club-1', MEMBER, 'v-1', 1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('N’EXPOSE JAMAIS de quantité de stock dans le panier', async () => {
    const h = makeStore({ variants: [VARIANT({ available: 7, onHand: 12 })] });
    const view = await h.cart.addItem('club-1', MEMBER, 'v-1', 1);
    const blob = JSON.stringify(view);
    // Les chiffres 7 (available) et 12 (onHand) ne doivent apparaître nulle
    // part ; seul inStock (booléen) est exposé.
    expect(view.items[0].inStock).toBe(true);
    expect(blob).not.toContain('"available"');
    expect(blob).not.toContain('"onHand"');
    expect(blob).not.toContain(':7');
    expect(blob).not.toContain(':12');
  });
});

describe('ShopCartService — scoping tenant + propriété (clubId dans l’écriture)', () => {
  it('ne modifie PAS la ligne quand le clubId ne correspond pas', async () => {
    const h = makeStore({ variants: [VARIANT()] });
    await h.cart.addItem('club-1', MEMBER, 'v-1', 2);
    const itemId = h.items[0].id;

    // Même itemId, mais club-2 : l'updateMany scopé par clubId ne mord pas.
    await expect(
      h.cart.setItemQuantity('club-2', MEMBER, itemId, 9),
    ).rejects.toThrow(NotFoundException);
    expect(h.items[0].quantity).toBe(2); // inchangé
  });

  it('ne modifie PAS la ligne d’un AUTRE viewer', async () => {
    const h = makeStore({ variants: [VARIANT()] });
    await h.cart.addItem('club-1', MEMBER, 'v-1', 2);
    const itemId = h.items[0].id;

    await expect(
      h.cart.setItemQuantity('club-1', { memberId: 'm-2', contactId: null }, itemId, 9),
    ).rejects.toThrow(NotFoundException);
    expect(h.items[0].quantity).toBe(2);
  });

  it('retire une ligne, mais pas celle d’un autre club', async () => {
    const h = makeStore({ variants: [VARIANT()] });
    await h.cart.addItem('club-1', MEMBER, 'v-1', 2);
    const itemId = h.items[0].id;

    await expect(
      h.cart.removeItem('club-2', MEMBER, itemId),
    ).rejects.toThrow(NotFoundException);
    expect(h.items).toHaveLength(1);

    await h.cart.removeItem('club-1', MEMBER, itemId);
    expect(h.items).toHaveLength(0);
  });
});

describe('ShopCartService.checkout — commande + facture + 3×', () => {
  async function seededCart(over?: {
    threshold?: number | null;
    available?: number;
    price?: number;
    qty?: number;
  }) {
    const h = makeStore({
      variants: [VARIANT({ available: over?.available ?? 5, product: { id: 'p-1', name: 'T-shirt', priceCents: over?.price ?? 2000, active: true, imageUrl: null } })],
      thresholdCents: over?.threshold ?? null,
    });
    await h.cart.addItem('club-1', MEMBER, 'v-1', over?.qty ?? 1);
    return h;
  }

  it('transforme le panier en commande PENDING + facture, et RÉSERVE le stock', async () => {
    const h = await seededCart({ available: 5, price: 2000, qty: 2 });

    const res = await h.cart.checkout('club-1', MEMBER, false);

    // Commande créée, stock réservé (available 5 → 3), onHand intact.
    expect(h.orders).toHaveLength(1);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].available).toBe(3);
    expect(h.variants[0].onHand).toBe(5);
    // Facture liée à la commande.
    expect(h.invoices).toHaveLength(1);
    expect(h.invoices[0].shopOrderId).toBe(res.orderId);
    expect(h.invoices[0].amountCents).toBe(4000);
    expect(h.invoices[0].installmentsCount).toBe(1);
    // Panier vidé.
    expect(h.items).toHaveLength(0);
    expect(res.installmentsCount).toBe(1);
  });

  it('REFUSE le 3× sous le seuil — et n’a RIEN écrit (rollback)', async () => {
    // Seuil 10 000, total 4 000 : le 3× demandé doit être refusé, et comme le
    // refus lève DANS la transaction, aucune commande, aucune réservation,
    // aucune facture ne subsiste.
    const h = await seededCart({ threshold: 10_000, available: 5, price: 2000, qty: 2 });

    await expect(h.cart.checkout('club-1', MEMBER, true)).rejects.toThrow(
      BadRequestException,
    );

    expect(h.orders).toHaveLength(0);
    expect(h.invoices).toHaveLength(0);
    expect(h.variants[0].available).toBe(5); // stock intact
    expect(h.items).toHaveLength(1); // panier intact
  });

  it('REFUSE le 3× quand le seuil est null (3× désactivé)', async () => {
    const h = await seededCart({ threshold: null, price: 50_000, qty: 1 });
    await expect(h.cart.checkout('club-1', MEMBER, true)).rejects.toThrow(
      BadRequestException,
    );
    expect(h.orders).toHaveLength(0);
  });

  it('ACCORDE le 3× quand le total atteint le seuil', async () => {
    const h = await seededCart({ threshold: 10_000, price: 6000, qty: 2 }); // total 12 000
    const res = await h.cart.checkout('club-1', MEMBER, true);
    expect(res.installmentsCount).toBe(3);
    expect(h.invoices[0].installmentsCount).toBe(3);
  });

  it('la réservation atomique n’est pas contournée : rupture au checkout ⇒ rollback', async () => {
    // Panier demande 2, mais le stock est tombé à 1 depuis l'ajout. Le reserve
    // conditionnel refuse, la transaction est annulée : ni commande ni facture.
    const h = await seededCart({ available: 5, qty: 2 });
    h.variants[0].available = 1;

    await expect(h.cart.checkout('club-1', MEMBER, false)).rejects.toThrow(
      BadRequestException,
    );

    expect(h.orders).toHaveLength(0);
    expect(h.invoices).toHaveLength(0);
    expect(h.variants[0].available).toBe(1); // pas décrémenté
  });

  it('refuse un panier vide', async () => {
    const h = makeStore({ variants: [VARIANT()] });
    await expect(h.cart.checkout('club-1', MEMBER, false)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ShopService.fulfillPaidShopOrderInTx — idempotence webhook', () => {
  async function paidCartOrder() {
    const h = await (async () => {
      const s = makeStore({ variants: [VARIANT({ available: 5, onHand: 5 })] });
      await s.cart.addItem('club-1', MEMBER, 'v-1', 2);
      await s.cart.checkout('club-1', MEMBER, false);
      return s;
    })();
    return h;
  }

  it('sort le stock UNE fois : PENDING → PAID + onHand décrémenté', async () => {
    const h = await paidCartOrder();
    const orderId = h.orders[0].id;
    expect(h.variants[0].onHand).toBe(5);
    expect(h.variants[0].available).toBe(3); // réservé au checkout

    await h.db.$transaction((tx: any) =>
      h.shop.fulfillPaidShopOrderInTx(tx, 'club-1', orderId),
    );

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variants[0].onHand).toBe(3); // sorti
    expect(h.variants[0].available).toBe(3); // inchangé
  });

  it('REJOUÉ, ne décompte PAS le stock une seconde fois', async () => {
    const h = await paidCartOrder();
    const orderId = h.orders[0].id;

    await h.db.$transaction((tx: any) =>
      h.shop.fulfillPaidShopOrderInTx(tx, 'club-1', orderId),
    );
    const onHandAfterFirst = h.variants[0].onHand;

    // Deuxième livraison du même webhook : la commande n'est plus PENDING,
    // le updateMany conditionnel renvoie count 0, aucune sortie de stock.
    await h.db.$transaction((tx: any) =>
      h.shop.fulfillPaidShopOrderInTx(tx, 'club-1', orderId),
    );

    expect(h.variants[0].onHand).toBe(onHandAfterFirst); // pas de double sortie
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
  });

  it('ne sort PAS le stock d’une commande d’un AUTRE club', async () => {
    const h = await paidCartOrder();
    const orderId = h.orders[0].id;

    await h.db.$transaction((tx: any) =>
      h.shop.fulfillPaidShopOrderInTx(tx, 'club-2', orderId),
    );

    // clubId dans le WHERE de la transition : rien ne bascule.
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.variants[0].onHand).toBe(5);
  });
});
