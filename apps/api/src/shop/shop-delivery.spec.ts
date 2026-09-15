import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  ShopOrderStatus,
  ShopStockMovementKind,
} from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import {
  deliveredLinesOf,
  readDeliveredLines,
  ShopService,
} from './shop.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Remise signée et sortie de stock à la première des deux actions (ADR-0017),
 * lignes remises figées avec la signature (ADR-0020).
 *
 * Vrais `ShopService` et `ShopStockService` ; seul Prisma est doublé. Le double
 * applique TOUTES les clauses présentes du `where` — y compris `null` et
 * `{ not: null }` —, lève sur celles qu'il ne sait pas simuler, et annule les
 * écritures d'une transaction qui lève, comme PostgreSQL. C'est ce qui fait
 * mordre les tests d'idempotence : retirer `fulfilledAt: null` d'une écriture
 * fait sortir le stock deux fois, et un test le constate.
 */

/**
 * En-tête PNG valide (les 8 octets de signature du format). La remise ne décode
 * pas l'image ; le bon de livraison, lui, sait survivre à une image abîmée —
 * cf. shop-delivery-note-pdf.service.spec.ts.
 */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

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
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  termsAssetId: string | null;
  termsAcceptedAt: Date | null;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  deliveredByUserId: string | null;
  deliverySignerName: string | null;
  deliverySignaturePng: string | null;
  /** Lignes remises, figées avec la signature (ADR-0020). */
  deliveredLines: unknown;
  lines: LineRow[];
};

type InvoiceRow = {
  id: string;
  clubId: string;
  shopOrderId: string;
  status: InvoiceStatus;
  amountCents: number;
  payments?: Array<{ id: string; amountCents: number }>;
};

/** Refuse toute clause que le double ne sait pas appliquer. */
function allowOnly(where: object, keys: string[]): void {
  for (const k of Object.keys(where)) {
    if (!keys.includes(k)) throw new Error(`clause non simulée : ${k}`);
  }
}

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

const NO_PAID_SUPPLEMENT =
  '{"none":{"supplementInvoice":{"is":{"payments":{"some":{}}}}}}';

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
  const members = [
    { id: 'm-1', firstName: 'Camillah', lastName: 'ABDILLAH', email: 'famille.abdillah@example.fr' },
  ];
  const movements: Array<Record<string, unknown>> = [];

  const invoiceOf = (orderId: string) =>
    invoices.find((i) => i.shopOrderId === orderId) ?? null;

  // Garde « aucun encaissement » (ADR-0019) : commande sans facture, ou
  // facture sans paiement. Chaque branche est appliquée pour de vrai.
  const withoutPaymentBranch = (o: OrderRow, branch: any): boolean => {
    allowOnly(branch, ['invoice']);
    const inv = invoiceOf(o.id);
    if (branch.invoice.is === null) return inv === null;
    if (JSON.stringify(branch.invoice.is) !== '{"payments":{"none":{}}}') {
      throw new Error('branche invoice non simulée');
    }
    return inv !== null && (inv.payments ?? []).length === 0;
  };

  const orderMatches = (o: OrderRow, where: any): boolean => {
    allowOnly(where, [
      'id',
      'clubId',
      'status',
      'memberId',
      'contactId',
      'fulfilledAt',
      'deliveredAt',
      'termsAcceptedAt',
      'lines',
      'OR',
      'adjustments',
    ]);
    // Aucun échange dans ce monde : aucun reste à payer encaissé (ADR-0020).
    if (
      where.adjustments !== undefined &&
      JSON.stringify(where.adjustments) !== NO_PAID_SUPPLEMENT
    ) {
      throw new Error('clause adjustments non simulée');
    }
    return (
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
      nullableMatches(o.termsAcceptedAt, where.termsAcceptedAt) &&
      // `lines: { none: { awaitingStockQty: { gt } } }` (ADR-0018), appliquée
      // pour de vrai : sans elle, la remise d'une commande qui attend encore un
      // arrivage passerait ici quoi qu'écrive le service.
      (where.lines === undefined ||
        !o.lines.some(
          (l) => l.awaitingStockQty > where.lines.none.awaitingStockQty.gt,
        )) &&
      (where.OR === undefined ||
        where.OR.some((branch: any) => withoutPaymentBranch(o, branch)))
    );
  };

  // Les factures d'une commande : la sienne, ou celle du reste à payer d'un
  // échange (ADR-0020) — ce monde n'en a aucune, la branche ne désigne rien.
  const invoiceBranch = (i: InvoiceRow, branch: any): boolean => {
    allowOnly(branch, ['shopOrderId', 'shopAdjustment']);
    if (branch.shopAdjustment !== undefined) return false;
    return typeof branch.shopOrderId === 'object'
      ? branch.shopOrderId.in.includes(i.shopOrderId)
      : i.shopOrderId === branch.shopOrderId;
  };

  const invoiceMatches = (i: InvoiceRow, where: any): boolean => {
    allowOnly(where, [
      'id',
      'shopOrderId',
      'clubId',
      'status',
      'isCreditNote',
      'OR',
      'payments',
    ]);
    if (
      where.payments !== undefined &&
      JSON.stringify(where.payments) !== '{"none":{}}'
    ) {
      throw new Error('clause payments non simulée');
    }
    return (
      (where.id === undefined || i.id === where.id) &&
      (where.shopOrderId === undefined || i.shopOrderId === where.shopOrderId) &&
      (where.clubId === undefined || i.clubId === where.clubId) &&
      (where.status === undefined || i.status === where.status) &&
      // Aucun avoir dans ce monde : toutes les factures sont des factures.
      (where.isCreditNote === undefined || where.isCreditNote === false) &&
      (where.OR === undefined ||
        where.OR.some((branch: any) => invoiceBranch(i, branch))) &&
      (where.payments === undefined || (i.payments ?? []).length === 0)
    );
  };

  let depth = 0;
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
      // hydrateBuyers : les factures des commandes affichées, et ce qui y
      // reste dû.
      findMany: jest.fn(async ({ where }: any) =>
        invoices
          .filter((i) => invoiceMatches(i, where))
          .map((i) => ({
            id: i.id,
            shopOrderId: i.shopOrderId,
            status: i.status,
            amountCents: i.amountCents,
            shopAdjustment: null,
            payments: (i.payments ?? []).map((p) => ({ amountCents: p.amountCents })),
            creditNotes: [],
          })),
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
      // Écriture par identifiant, après le verrou : les lignes remises figées.
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        allowOnly(data, ['deliveredLines', 'totalCents']);
        const o = orders.find((x) => x.id === where.id);
        if (!o) throw new Error('order not found');
        Object.assign(o, structuredClone(data));
        return { ...o, lines: o.lines.map((l) => ({ ...l })) };
      }),
      findFirst: jest.fn(async ({ where, include, select }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return null;
        const inv = invoiceOf(o.id);
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
          // Lecture qui nomme un refus : les encaissements de la commande.
          ...(select?.invoice
            ? {
                invoice: inv
                  ? { payments: (inv.payments ?? []).map((p) => ({ id: p.id })) }
                  : null,
              }
            : {}),
          ...(select?.adjustments ? { adjustments: [] } : {}),
        };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) throw new Error('order not found');
        return { ...o, lines: o.lines.map((l) => ({ ...l })) };
      }),
    },
    // Annulation d'une précommande (ADR-0018) : l'attente est remise à zéro sur
    // les lignes de la commande. Toutes les clauses présentes sont appliquées.
    shopOrderLine: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['orderId', 'awaitingStockQty']);
        const hit = orders
          .flatMap((o) => o.lines)
          .filter(
            (l) =>
              (where.orderId === undefined || l.orderId === where.orderId) &&
              (where.awaitingStockQty?.gt === undefined ||
                l.awaitingStockQty > where.awaitingStockQty.gt),
          );
        hit.forEach((l) => {
          l.awaitingStockQty = data.awaitingStockQty;
        });
        return { count: hit.length };
      }),
    },
    // Aucun échange ni annulation d'article dans ce monde (ADR-0020).
    shopOrderAdjustment: {
      findMany: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['orderId']);
        return [];
      }),
    },
    shopProductVariant: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id', 'clubId', 'trackStock']);
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
    // Verrou des factures de la commande (ADR-0022, §3), le seul SQL brut de
    // ces chemins. L'exclusion elle-même se vérifie dans invoice-void-lock.spec.ts.
    $executeRaw: jest.fn(async (sql: TemplateStringsArray) => {
      const text = sql.join('?');
      if (!text.includes("pg_advisory_xact_lock(hashtext('clubflow:invoice')")) {
        throw new Error(`SQL brut non simulé : ${text}`);
      }
      return 0;
    }),
    $transaction: jest.fn(async (fn: any) => {
      const snap = {
        orders: structuredClone(orders),
        invoices: structuredClone(invoices),
        variant: { ...variant },
        movements: structuredClone(movements),
      };
      depth += 1;
      try {
        return await fn(db);
      } catch (e) {
        orders.splice(0, orders.length, ...snap.orders);
        invoices.splice(0, invoices.length, ...snap.invoices);
        movements.splice(0, movements.length, ...snap.movements);
        Object.assign(variant, snap.variant);
        throw e;
      } finally {
        depth -= 1;
      }
    }),
  };

  const preorders = {
    allocateQuietly: jest.fn(
      async (_clubId: string, _variantIds: Iterable<string>): Promise<void> =>
        undefined,
    ),
  };
  const stock = new ShopStockService(db as unknown as PrismaService);
  const shop = new ShopService(
    db as unknown as PrismaService,
    stock,
    {} as unknown as ShopPurchaseOrdersService,
    preorders as never,
  );
  return {
    db,
    shop,
    orders,
    variant,
    movements,
    invoices,
    preorders,
    /** Transactions ouvertes à cet instant : 0 hors de toute transaction. */
    txDepth: () => depth,
  };
}

const LINE = (over: Partial<LineRow> = {}): LineRow => ({
  id: 'line-1',
  orderId: 'order-1',
  productId: 'p-1',
  variantId: 'v-1',
  quantity: 2,
  unitPriceCents: 1250,
  label: 'Kimono — 120/130',
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
  totalCents: 2500,
  note: null,
  createdAt: new Date('2026-09-13T08:00:00Z'),
  updatedAt: new Date('2026-09-13T08:00:00Z'),
  paidAt: null,
  cancelledAt: null,
  cancelReason: null,
  termsAssetId: null,
  termsAcceptedAt: null,
  fulfilledAt: null,
  deliveredAt: null,
  deliveredByUserId: null,
  deliverySignerName: null,
  deliverySignaturePng: null,
  deliveredLines: null,
  lines: [LINE()],
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
    // Préremplit l'envoi du bon par e-mail.
    expect(shaped.buyerEmail).toBe('famille.abdillah@example.fr');
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

describe('les lignes remises, figées avec la signature (ADR-0020)', () => {
  const KIMONO_REMIS = { label: 'Kimono — 120/130', quantity: 2, unitPriceCents: 1250 };

  it('la remise fige ce que la personne emporte', async () => {
    const h = makeStore({ orders: [ORDER()] });

    await deliver(h);

    expect(h.orders[0].deliveredLines).toEqual({
      lines: [KIMONO_REMIS],
      totalCents: 2500,
    });
  });

  it('un échange après la remise ne réécrit pas le bon de livraison', async () => {
    const h = makeStore({ orders: [ORDER()] });
    await deliver(h);
    // L'échange retire un kimono et en ajoute un autre (`adjustLineInTx`).
    const o = h.orders[0];
    o.lines[0].cancelledQty = 1;
    o.lines.push(
      LINE({ id: 'line-2', variantId: 'v-2', label: 'Kimono — 140/150', quantity: 1, unitPriceCents: 1500 }),
    );
    o.totalCents = 2750;

    const note = await h.shop.getDeliveryNote('club-1', 'order-1');

    expect(note!.order.lines).toEqual([KIMONO_REMIS]);
    expect(note!.order.totalCents).toBe(2500);
  });

  it('remise antérieure aux lignes figées : le bon lit les articles encore dans la commande', async () => {
    const h = makeStore({
      orders: [
        ORDER({
          status: ShopOrderStatus.PAID,
          paidAt: new Date('2026-09-10T09:00:00Z'),
          fulfilledAt: new Date('2026-09-10T09:00:00Z'),
          deliveredAt: new Date('2026-09-10T09:00:00Z'),
          deliverySignerName: 'Camillah ABDILLAH',
          deliverySignaturePng: PNG,
          lines: [
            LINE({ quantity: 3, cancelledQty: 1 }),
            LINE({ id: 'line-2', label: 'Ceinture', quantity: 1, cancelledQty: 1, unitPriceCents: 800 }),
          ],
        }),
      ],
    });

    const note = await h.shop.getDeliveryNote('club-1', 'order-1');

    expect(note!.order.lines).toEqual([KIMONO_REMIS]);
    expect(note!.order.totalCents).toBe(2500);
  });

  it('lignes figées illisibles : le bon retombe sur la commande plutôt que d’échouer', async () => {
    const h = makeStore({
      orders: [
        ORDER({
          deliveredAt: new Date('2026-09-10T09:00:00Z'),
          deliverySignerName: 'Camillah ABDILLAH',
          deliverySignaturePng: PNG,
          deliveredLines: { lines: [{ label: 'Kimono', quantity: '2' }], totalCents: 9999 },
          lines: [LINE({ quantity: 1 })],
        }),
      ],
    });

    const note = await h.shop.getDeliveryNote('club-1', 'order-1');

    expect(note!.order.lines).toEqual([{ ...KIMONO_REMIS, quantity: 1 }]);
    expect(note!.order.totalCents).toBe(1250);
  });

  it('`deliveredLinesOf` : seules les unités encore dans la commande', () => {
    expect(
      deliveredLinesOf({
        lines: [
          LINE({ quantity: 3, cancelledQty: 1 }),
          LINE({ id: 'line-2', label: 'Ceinture', quantity: 2, cancelledQty: 2, unitPriceCents: 800 }),
        ],
      }),
    ).toEqual({ lines: [KIMONO_REMIS], totalCents: 2500 });
  });

  it.each([
    ['absentes', null],
    ['un tableau', [KIMONO_REMIS]],
    ['sans total', { lines: [KIMONO_REMIS] }],
    ['un total qui n’est pas un nombre', { lines: [KIMONO_REMIS], totalCents: '2500' }],
    ['une ligne sans prix', { lines: [{ label: 'Kimono', quantity: 2 }], totalCents: 2500 }],
    ['une ligne nulle', { lines: [null], totalCents: 0 }],
  ])('`readDeliveredLines` : %s → null', (_cas, value) => {
    expect(readDeliveredLines(value as never)).toBeNull();
  });

  it('`readDeliveredLines` relit des lignes bien formées, sans champ de trop', () => {
    expect(
      readDeliveredLines({
        lines: [{ ...KIMONO_REMIS, note: 'ignorée' }],
        totalCents: 2500,
      }),
    ).toEqual({ lines: [KIMONO_REMIS], totalCents: 2500 });
  });
});

describe('les unités retirées de la commande (ADR-0020)', () => {
  it('au règlement, elles ne sortent pas du stock', async () => {
    const h = makeStore({
      orders: [ORDER({ lines: [LINE({ quantity: 3, cancelledQty: 1 })] })],
      onHand: 5,
      available: 3,
    });

    await payByCard(h);

    expect(h.variant.onHand).toBe(3);
    expect(h.movements).toEqual([
      expect.objectContaining({ kind: ShopStockMovementKind.FULFILL, onHandDelta: -2 }),
    ]);
  });

  it('à l’annulation, elles ne sont pas libérées une seconde fois', async () => {
    const h = makeStore({
      orders: [ORDER({ lines: [LINE({ quantity: 3, cancelledQty: 1 })] })],
      onHand: 5,
      available: 3,
    });

    await h.shop.cancelOrder('club-1', 'order-1');

    expect(h.variant.available).toBe(5);
    expect(h.movements).toEqual([
      expect.objectContaining({ kind: ShopStockMovementKind.RELEASE, availableDelta: 2 }),
    ]);
  });
});

describe('précommande : ce qui attend l’arrivage (ADR-0018)', () => {
  /** Kimono ×2 dont `awaiting` attendent l'arrivage — le reste est réservé. */
  const PREORDER = (awaiting: number, over: Partial<OrderRow> = {}) =>
    ORDER({
      ...over,
      lines: [LINE({ awaitingStockQty: awaiting })],
    });

  it('au règlement, seules les unités RÉSERVÉES sortent du stock', async () => {
    const h = makeStore({ orders: [PREORDER(1)], onHand: 1, available: 0 });

    await payByCard(h);

    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.variant.onHand).toBe(0);
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.FULFILL,
        onHandDelta: -1,
      }),
    ]);
  });

  it('tout en attente : le règlement ne sort rien, mais la commande est marquée sortie', async () => {
    const h = makeStore({ orders: [PREORDER(2)], onHand: 0, available: 0 });

    await payByCard(h);

    expect(h.variant.onHand).toBe(0);
    expect(fulfils(h)).toBe(0);
    // `fulfilledAt` posé : l'arrivage saura qu'il doit sortir ces unités.
    expect(h.orders[0].fulfilledAt).toBeInstanceOf(Date);
  });

  it('la commande dit, ligne par ligne, ce qui attend l’arrivage', async () => {
    const h = makeStore({ orders: [PREORDER(1)], onHand: 1, available: 0 });

    const shaped = await h.shop.markOrderPaid('club-1', 'order-1');

    expect(shaped.lines[0]).toMatchObject({ quantity: 2, awaitingStockQty: 1 });
  });

  it('refuse de remettre une commande dont un article attend l’arrivage, sans rien écrire', async () => {
    const h = makeStore({ orders: [PREORDER(1)], onHand: 1, available: 0 });

    await expect(deliver(h)).rejects.toThrow(/attente d’arrivage/);

    expect(h.orders[0].deliveredAt).toBeNull();
    expect(h.orders[0].deliverySignaturePng).toBeNull();
    expect(fulfils(h)).toBe(0);
  });

  it('le club annule : ne rend que les unités réservées, et l’attente s’éteint', async () => {
    const h = makeStore({ orders: [PREORDER(1)], onHand: 1, available: 0 });

    const res = await h.shop.cancelOrder('club-1', 'order-1');

    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(h.variant.available).toBe(1); // l'unité réservée, pas les deux
    expect(h.orders[0].lines[0].awaitingStockQty).toBe(0);
    expect(res.lines[0].awaitingStockQty).toBe(0);
    // Le stock rendu sert d'abord les précommandes des autres.
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
  });

  it('sert les précommandes APRÈS la transaction d’annulation, jamais dedans', async () => {
    // L'attribution verrouille d'autres commandes : prise dans cette
    // transaction, elle inverserait l'ordre des verrous (ShopPreorderService).
    const h = makeStore({ orders: [PREORDER(1)], onHand: 1, available: 0 });
    let depthAtCall = -1;
    h.preorders.allocateQuietly.mockImplementation(async () => {
      depthAtCall = h.txDepth();
    });

    await h.shop.cancelOrder('club-1', 'order-1');

    expect(depthAtCall).toBe(0);
  });

  it('annuler une commande qui attendait TOUT ne rend rien au stock', async () => {
    const h = makeStore({ orders: [PREORDER(2)], onHand: 0, available: 0 });

    await h.shop.cancelOrder('club-1', 'order-1');

    expect(h.variant.available).toBe(0);
    expect(h.movements).toHaveLength(0);
    expect(h.orders[0].lines[0].awaitingStockQty).toBe(0);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', []);
  });

  it('l’adhérent annule : même règle, et sa facture est annulée', async () => {
    const h = makeStore({
      orders: [PREORDER(1)],
      onHand: 1,
      available: 0,
      invoices: [
        {
          id: 'inv-1',
          clubId: 'club-1',
          shopOrderId: 'order-1',
          status: InvoiceStatus.OPEN,
          amountCents: 2500,
        },
      ],
    });
    let depthAtCall = -1;
    h.preorders.allocateQuietly.mockImplementation(async () => {
      depthAtCall = h.txDepth();
    });

    await h.shop.cancelOrderForViewer(
      'club-1',
      { memberId: 'm-1', contactId: null },
      'order-1',
    );

    expect(h.variant.available).toBe(1);
    expect(h.orders[0].lines[0].awaitingStockQty).toBe(0);
    expect(h.invoices[0].status).toBe(InvoiceStatus.VOID);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', ['v-1']);
    expect(depthAtCall).toBe(0);
  });
});
