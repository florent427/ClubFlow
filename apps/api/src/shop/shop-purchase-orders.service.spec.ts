import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  ShopPurchaseOrderStatus,
  ShopReceiptDiscrepancyReason,
  ShopStockMovementKind,
} from '@prisma/client';
import type { AccountingMappingService } from '../accounting/accounting-mapping.service';
import { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopStockService } from './shop-stock.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Réception de commande fournisseur — ADR-0013.
 *
 * Le double SIMULE PostgreSQL : `updateMany` applique RÉELLEMENT les prédicats
 * du `where` sur les lignes en mémoire et renvoie le `count` réel. Il ne laisse
 * PAS inspecter la forme de la requête, et c'est délibéré : un test qui vérifie
 * qu'un filtre contient `status: { in: [...] }` reste vert même si ce filtre ne
 * mord sur rien (cf. pitfalls/test-verifie-la-forme-pas-le-comportement.md).
 *
 * Le vrai moteur de stock est branché — pas un mock : le rattachement du
 * mouvement à la ligne de réception est justement ce qu'on veut voir.
 */

type OrderRow = {
  id: string;
  clubId: string;
  supplierId: string;
  reference: string;
  status: ShopPurchaseOrderStatus;
  orderedAt: Date | null;
  expectedAt: Date | null;
  closedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LineRow = {
  id: string;
  clubId: string;
  orderId: string;
  variantId: string;
  orderedQty: number;
  receivedQty: number;
  unitCostCents: number;
  closed: boolean;
  createdAt: Date;
};

type VariantRow = {
  id: string;
  clubId: string;
  /** Sert au prix d'achat par défaut (ADR-0021) : l'offre vit sur le produit. */
  productId?: string;
  trackStock: boolean;
  onHand: number;
  available: number;
  avgCostCents: number;
  lowStockAlertedAt: Date | null;
};

type EntryRow = {
  id: string;
  clubId: string;
  label: string;
  amountCents: number;
  occurredAt: Date;
  invoiceNumber: string | null;
  cancelledAt: Date | null;
  purchaseOrderId: string | null;
};

const CLUB = 'club-1';

function ordre(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'po-1',
    clubId: CLUB,
    supplierId: 'sup-1',
    reference: 'CF-2026-004',
    status: ShopPurchaseOrderStatus.ORDERED,
    orderedAt: new Date('2026-07-01'),
    expectedAt: null,
    closedAt: null,
    notes: null,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    ...over,
  };
}

function ligne(over: Partial<LineRow> = {}): LineRow {
  return {
    id: 'pol-1',
    clubId: CLUB,
    orderId: 'po-1',
    variantId: 'v-1',
    orderedQty: 20,
    receivedQty: 0,
    unitCostCents: 900,
    closed: false,
    createdAt: new Date('2026-07-01'),
    ...over,
  };
}

function variante(over: Partial<VariantRow> = {}): VariantRow {
  return {
    id: 'v-1',
    clubId: CLUB,
    trackStock: true,
    onHand: 0,
    available: 0,
    avgCostCents: 0,
    lowStockAlertedAt: null,
    ...over,
  };
}

function ecriture(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 'ae-1',
    clubId: CLUB,
    label: 'Facture Décathlon Pro',
    amountCents: 18_000,
    occurredAt: new Date('2026-07-15'),
    invoiceNumber: 'F-2026-118',
    cancelledAt: null,
    purchaseOrderId: null,
    ...over,
  };
}

/**
 * Applique un prédicat Prisma sur une ligne. Volontairement limité aux formes
 * réellement employées par le service : égalité, `in`, et le filtre de
 * relation `order: { status: { in } }`.
 */
function correspond(
  row: Record<string, any>,
  where: Record<string, any>,
  relations: { order?: (row: Record<string, any>) => OrderRow | undefined } = {},
): boolean {
  for (const [cle, attendu] of Object.entries(where)) {
    if (attendu === undefined) continue;

    // `OR` : au moins une branche doit correspondre.
    //
    // Sans ce cas, la clé `OR` était comparée telle quelle à `row.OR`
    // (undefined) et AUCUNE ligne ne correspondait jamais. Le double refusait
    // alors tout, ce qui rendait verts les tests de refus pour une raison qui
    // n'a rien à voir avec la garantie testée — le double, pas le code.
    if (cle === 'OR') {
      const branches = attendu as Array<Record<string, any>>;
      if (!branches.some((b) => correspond(row, b, relations))) return false;
      continue;
    }

    if (cle === 'order') {
      const parent = relations.order?.(row);
      if (!parent) return false;
      if (!correspond(parent, attendu as Record<string, any>)) return false;
      continue;
    }
    if (cle === 'reference' && attendu && typeof attendu === 'object') {
      const prefixe = (attendu as { startsWith?: string }).startsWith;
      if (prefixe !== undefined && !String(row[cle]).startsWith(prefixe)) {
        return false;
      }
      continue;
    }
    if (attendu && typeof attendu === 'object' && 'in' in attendu) {
      if (!(attendu.in as unknown[]).includes(row[cle])) return false;
      continue;
    }
    if (row[cle] !== attendu) return false;
  }
  return true;
}

function applique(row: Record<string, any>, data: Record<string, any>) {
  for (const [cle, valeur] of Object.entries(data)) {
    if (valeur && typeof valeur === 'object' && 'increment' in valeur) {
      row[cle] = (row[cle] as number) + (valeur.increment as number);
    } else if (valeur && typeof valeur === 'object' && 'decrement' in valeur) {
      row[cle] = (row[cle] as number) - (valeur.decrement as number);
    } else {
      row[cle] = valeur;
    }
  }
}

function makeHarness(seed: {
  orders?: OrderRow[];
  lines?: LineRow[];
  variants?: VariantRow[];
  suppliers?: Array<{
    id: string;
    clubId: string;
    active: boolean;
    leadTimeDays: number | null;
  }>;
  entries?: EntryRow[];
  /** Offres fournisseur (ADR-0021). Vides par défaut : le prix reste à 0. */
  offers?: Array<{
    id: string;
    clubId: string;
    productId: string;
    supplierId: string;
    unitCostCents: number | null;
  }>;
  overrides?: Array<{
    id: string;
    clubId: string;
    offerId: string;
    variantId: string;
    unitCostCents: number | null;
  }>;
}) {
  const orders = seed.orders ?? [];
  const lines = seed.lines ?? [];
  const variants = seed.variants ?? [variante()];
  const suppliers = seed.suppliers ?? [
    { id: 'sup-1', clubId: CLUB, active: true, leadTimeDays: 7 },
  ];
  const entries = seed.entries ?? [];
  const offers = seed.offers ?? [];
  const overrides = seed.overrides ?? [];
  const receptions: Array<Record<string, any>> = [];
  const receptionLines: Array<Record<string, any>> = [];
  const movements: Array<Record<string, any>> = [];

  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;

  const parentOrder = (l: Record<string, any>) =>
    orders.find((o) => o.id === l.orderId);

  const table = <T extends Record<string, any>>(
    rows: T[],
    prefixe: string,
    rel: Parameters<typeof correspond>[2] = {},
  ) => ({
    findMany: jest.fn(async ({ where }: { where?: any } = {}) =>
      rows.filter((r) => correspond(r, where ?? {}, rel)).map((r) => ({ ...r })),
    ),
    findFirst: jest.fn(async ({ where }: { where?: any } = {}) => {
      const r = rows.find((x) => correspond(x, where ?? {}, rel));
      return r ? { ...r } : null;
    }),
    findFirstOrThrow: jest.fn(async ({ where }: { where?: any } = {}) => {
      const r = rows.find((x) => correspond(x, where ?? {}, rel));
      if (!r) throw new Error('not found');
      return { ...r };
    }),
    count: jest.fn(async ({ where }: { where?: any } = {}) =>
      rows.filter((r) => correspond(r, where ?? {}, rel)).length,
    ),
    updateMany: jest.fn(async ({ where, data }: { where: any; data: any }) => {
      const hit = rows.filter((r) => correspond(r, where, rel));
      hit.forEach((r) => applique(r, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: any }) => {
      const hit = rows.filter((r) => correspond(r, where, rel));
      hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
      return { count: hit.length };
    }),
    create: jest.fn(async ({ data }: { data: any }) => {
      const row = { id: id(prefixe), ...data } as T;
      rows.push(row);
      return { ...row };
    }),
  });

  const orderTable = table(orders, 'po');
  // La commande porte une relation `supplier` que `sendOrder` inclut : le
  // double la résout, sans quoi le code lirait `undefined` et le délai de
  // livraison ne serait jamais appliqué — un test vert pour une mauvaise
  // raison.
  orderTable.findFirstOrThrow = jest.fn(
    async ({ where }: { where?: any } = {}) => {
      const r = orders.find((x) => correspond(x, where ?? {}));
      if (!r) throw new Error('not found');
      return {
        ...r,
        supplier: suppliers.find((s) => s.id === r.supplierId) ?? null,
      } as never;
    },
  );

  // Le brouillon à compléter est le plus récemment modifié (ADR-0021 §4) : le
  // double applique le tri demandé, sans quoi il rendrait le premier venu.
  orderTable.findFirst = jest.fn(
    async ({ where, orderBy }: { where?: any; orderBy?: Record<string, 'asc' | 'desc'> } = {}) => {
      const hits = orders.filter((x) => correspond(x, where ?? {}));
      if (orderBy) {
        const [field, dir] = Object.entries(orderBy)[0];
        hits.sort((a, b) => {
          const d =
            new Date((a as any)[field]).getTime() - new Date((b as any)[field]).getTime();
          return dir === 'desc' ? -d : d;
        });
      }
      return hits[0] ? { ...hits[0] } : null;
    },
  ) as unknown as typeof orderTable.findFirst;

  const tx = {
    shopPurchaseOrder: orderTable,
    shopPurchaseOrderLine: table(lines, 'pol', { order: parentOrder }),
    shopPurchaseReception: table(receptions, 'rec'),
    shopPurchaseReceptionLine: table(receptionLines, 'recl'),
    shopSupplier: table(suppliers, 'sup'),
    shopProductVariant: table(variants, 'v'),
    shopStockMovement: table(movements, 'mv'),
    accountingEntry: table(entries, 'ae'),
    shopProductSupplier: table(offers, 'off'),
    shopProductSupplierVariant: table(overrides, 'ovr'),
  };

  // Profondeur de transaction : l'attribution des arrivages part APRÈS la
  // réception, jamais dedans (ADR-0018).
  let depth = 0;
  // ROLLBACK réel : une transaction qui lève n'a rien écrit. Sans lui, un
  // réapprovisionnement réparti chez plusieurs fournisseurs qui échoue en route
  // laisserait des brouillons à moitié faits — ce que PostgreSQL n'autorise pas.
  const tables = [
    orders,
    lines,
    receptions,
    receptionLines,
    movements,
    variants,
    entries,
    offers,
    overrides,
  ] as Array<Array<Record<string, any>>>;
  // Commandes créées DANS une transaction pas encore committée : une lecture
  // faite HORS de la transaction ne les voit pas, comme sous PostgreSQL. Sans
  // cela, une référence proposée hors transaction paraîtrait libre alors que
  // la transaction vient de la prendre.
  const pendingOrderIds = new Set<string>();
  const insertOrder = orderTable.create.getMockImplementation()!;
  orderTable.create.mockImplementation(async (args: { data: any }) => {
    const row = await insertOrder(args);
    if (depth > 0) pendingOrderIds.add(row.id);
    return row;
  });
  const committedOrders = {
    ...orderTable,
    findMany: jest.fn(async (args: { where?: any } = {}) => {
      const rows = await orderTable.findMany(args);
      return depth > 0 ? rows.filter((r) => !pendingOrderIds.has(r.id)) : rows;
    }),
  };

  const prisma = {
    ...tx,
    shopPurchaseOrder: committedOrders,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      depth += 1;
      const saved = tables.map((rows) => rows.map((r) => ({ ...r })));
      try {
        return await fn(tx);
      } catch (err) {
        tables.forEach((rows, i) => rows.splice(0, rows.length, ...saved[i]));
        throw err;
      } finally {
        depth -= 1;
        if (depth === 0) pendingOrderIds.clear();
      }
    }),
  };

  const stock = new ShopStockService(prisma as unknown as PrismaService);
  // Le compte d'achat proposé passe par le mécanisme de mapping DÉJÀ en place ;
  // ce lot n'en invente aucun, il ajoute seulement le défaut 607000.
  const mapping = {
    resolveAccountWithLabel: jest
      .fn()
      .mockResolvedValue({ code: '607000', label: 'Achats de marchandises' }),
  };
  // L'attribution elle-même a sa spec (shop-preorder.service.spec) : ici, on
  // vérifie QUAND et AVEC QUOI la réception la déclenche.
  const preorders = {
    allocateQuietly: jest.fn(
      async (_clubId: string, _variantIds: Iterable<string>): Promise<void> =>
        undefined,
    ),
  };
  const svc = new ShopPurchaseOrdersService(
    prisma as unknown as PrismaService,
    stock,
    mapping as unknown as AccountingMappingService,
    preorders as never,
  );
  return {
    svc,
    preorders,
    txDepth: () => depth,
    orders,
    lines,
    variants,
    receptions,
    receptionLines,
    movements,
    entries,
    mapping,
    orderTable,
  };
}

// ====================================================================
// Réception : le cœur du lot
// ====================================================================

describe('receiveOrder — statut calculé, jamais saisi', () => {
  it('réception PARTIELLE puis COMPLÉMENTAIRE : le statut suit', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    // 17 sur 20, motif BACKORDER : le reliquat est attendu.
    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 17,
          discrepancyReason: ShopReceiptDiscrepancyReason.BACKORDER,
        },
      ],
    });

    expect(h.orders[0].status).toBe(
      ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
    );
    expect(h.lines[0].receivedQty).toBe(17);
    expect(h.lines[0].closed).toBe(false);
    expect(h.orders[0].closedAt).toBeNull();
    expect(h.variants[0].onHand).toBe(17);

    // Les 3 manquants arrivent : le cumul retombe juste, plus de motif requis.
    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 3 }],
    });

    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.RECEIVED);
    expect(h.lines[0].receivedQty).toBe(20);
    expect(h.lines[0].closed).toBe(true);
    expect(h.orders[0].closedAt).not.toBeNull();
    expect(h.variants[0].onHand).toBe(20);
    expect(h.variants[0].available).toBe(20);
  });

  it('BACKORDER laisse la ligne OUVERTE, SUPPLIER_SHORTAGE la SOLDE courte', async () => {
    // La distinction qui fait tout le rapprochement : « ça arrive » contre
    // « on ne l'aura jamais ». Même quantité reçue, deux issues opposées.
    const attendu = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });
    await attendu.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 17,
          discrepancyReason: ShopReceiptDiscrepancyReason.BACKORDER,
        },
      ],
    });

    const perdu = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });
    await perdu.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 17,
          discrepancyReason: ShopReceiptDiscrepancyReason.SUPPLIER_SHORTAGE,
        },
      ],
    });

    expect(attendu.lines[0].closed).toBe(false);
    expect(attendu.orders[0].status).toBe(
      ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
    );

    expect(perdu.lines[0].closed).toBe(true);
    // Toutes les lignes soldées : la commande est RÉCEPTIONNÉE, courte.
    expect(perdu.orders[0].status).toBe(ShopPurchaseOrderStatus.RECEIVED);
    expect(perdu.lines[0].receivedQty).toBe(17);
  });

  it('REFUSE un écart sans motif, et n’écrit RIEN', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 17 }],
      }),
    ).rejects.toThrow(BadRequestException);

    // Les assertions qui mordent : aucun effet de bord n'a précédé la garde.
    expect(h.lines[0].receivedQty).toBe(0);
    expect(h.variants[0].onHand).toBe(0);
    expect(h.movements).toHaveLength(0);
    expect(h.receptions).toHaveLength(0);
  });

  it('REFUSE le motif OTHER sans commentaire', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [
          {
            orderLineId: 'pol-1',
            receivedQty: 17,
            discrepancyReason: ShopReceiptDiscrepancyReason.OTHER,
            discrepancyNote: '   ',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(h.variants[0].onHand).toBe(0);
  });

  it('REFUSE de réceptionner une commande DÉJÀ REÇUE', async () => {
    // Sans le prédicat de statut dans l'écriture, la marchandise entrerait une
    // seconde fois en stock — et le placard mentirait du double.
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.RECEIVED })],
      lines: [ligne({ orderedQty: 20, receivedQty: 20, closed: true })],
      variants: [variante({ onHand: 20, available: 20 })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(h.variants[0].onHand).toBe(20);
    expect(h.movements).toHaveLength(0);
  });

  it('REFUSE de réceptionner une commande ANNULÉE', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.CANCELLED })],
      lines: [ligne()],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 20 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(h.variants[0].onHand).toBe(0);
  });

  it('REFUSE la commande d’un AUTRE club', async () => {
    // La frontière multi-tenant est dans la même requête que la garantie
    // métier, pas dans un findFirst préalable.
    const h = makeHarness({
      orders: [ordre({ clubId: 'club-2' })],
      lines: [ligne({ clubId: 'club-2' })],
      variants: [variante({ clubId: 'club-2' })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 20 }],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(h.variants[0].onHand).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('RATTACHE le mouvement de stock à la ligne de réception', async () => {
    // C'est ce rattachement qui rend le journal précis : « +17 reçu sur
    // commande CF-2026-004 » au lieu de « +17 ».
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 17 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 17 }],
    });

    expect(h.movements).toHaveLength(1);
    expect(h.movements[0]).toMatchObject({
      kind: ShopStockMovementKind.RESTOCK,
      onHandDelta: 17,
      availableDelta: 17,
      reason: 'Réception sur commande CF-2026-004',
    });
    expect(h.receptionLines).toHaveLength(1);
    expect(h.receptionLines[0].movementId).toBe(h.movements[0].id);
    expect(h.receptionLines[0].orderLineId).toBe('pol-1');
  });

  it('n’engendre AUCUN mouvement pour une ligne reçue à zéro', async () => {
    // « Rien n'est arrivé », avec son motif : il n'y a rien à archiver, mais
    // la ligne est soldée et la réception documentée.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 0,
          discrepancyReason: ShopReceiptDiscrepancyReason.SUPPLIER_SHORTAGE,
        },
      ],
    });

    expect(h.movements).toHaveLength(0);
    expect(h.receptionLines[0].movementId).toBeNull();
    expect(h.lines[0].closed).toBe(true);
    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.RECEIVED);
  });

  it('REFUSE une ligne déjà SOLDÉE', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.PARTIALLY_RECEIVED })],
      lines: [
        ligne({ id: 'pol-1', orderedQty: 20, receivedQty: 17, closed: true }),
        ligne({ id: 'pol-2', variantId: 'v-2', orderedQty: 5 }),
      ],
      variants: [variante({ id: 'v-1' }), variante({ id: 'v-2' })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 3 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(h.lines[0].receivedQty).toBe(17);
  });

  it('une commande à PLUSIEURS lignes ne se solde qu’une fois toutes réglées', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [
        ligne({ id: 'pol-1', variantId: 'v-1', orderedQty: 10 }),
        ligne({ id: 'pol-2', variantId: 'v-2', orderedQty: 5 }),
      ],
      variants: [variante({ id: 'v-1' }), variante({ id: 'v-2' })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 10 }],
    });
    expect(h.orders[0].status).toBe(
      ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
    );

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-2', receivedQty: 5 }],
    });
    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.RECEIVED);
  });

  it('REFUSE deux fois la même ligne dans une seule livraison', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [
          { orderLineId: 'pol-1', receivedQty: 10 },
          { orderLineId: 'pol-1', receivedQty: 10 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(h.variants[0].onHand).toBe(0);
  });

  it('REFUSE une ligne qui n’appartient pas à la commande', async () => {
    const h = makeHarness({
      orders: [ordre({ id: 'po-1' }), ordre({ id: 'po-2', reference: 'CF-2026-005' })],
      lines: [ligne({ id: 'pol-9', orderId: 'po-2' })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-9', receivedQty: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(h.lines[0].receivedQty).toBe(0);
  });

  it('OVER_DELIVERY solde la ligne et fait entrer le surplus en stock', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 22,
          discrepancyReason: ShopReceiptDiscrepancyReason.OVER_DELIVERY,
        },
      ],
    });

    expect(h.lines[0].closed).toBe(true);
    expect(h.lines[0].receivedQty).toBe(22);
    expect(h.variants[0].onHand).toBe(22);
    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.RECEIVED);
  });
});

// ====================================================================
// Coût moyen pondéré
// ====================================================================

describe('avgCostCents — pondéré à la réception, dans la même transaction', () => {
  it('pose le coût d’une PREMIÈRE entrée sur un stock vide', async () => {
    // 0 × 0 + 10 × 900, sur 10 unités : le coût moyen EST le coût d'achat.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 10, unitCostCents: 900 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 10 }],
    });

    expect(h.variants[0].avgCostCents).toBe(900);
  });

  it('PONDÈRE une seconde entrée plus chère avec le stock existant', async () => {
    // 10 à 900 déjà en stock, 10 arrivent à 1100 :
    //   (10 × 900 + 10 × 1100) / 20 = 1000.
    // Une simple écrasure donnerait 1100, une moyenne non pondérée aussi —
    // les deux se distinguent ici.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 10, unitCostCents: 1100 })],
      variants: [variante({ onHand: 10, available: 10, avgCostCents: 900 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 10 }],
    });

    expect(h.variants[0].avgCostCents).toBe(1000);
  });

  it('PONDÈRE par les QUANTITÉS, pas par le nombre de réceptions', async () => {
    // 30 à 900, puis 10 à 1300 : (30×900 + 10×1300) / 40 = 1000.
    // Une moyenne arithmétique des deux coûts donnerait 1100.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 10, unitCostCents: 1300 })],
      variants: [variante({ onHand: 30, available: 30, avgCostCents: 900 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 10 }],
    });

    expect(h.variants[0].avgCostCents).toBe(1000);
  });

  it('deux réceptions successives se CUMULENT au lieu de s’écraser', async () => {
    // 7 à 1000 puis 3 à 2000 : (7×1000 + 3×2000) / 10 = 1300.
    // Si la seconde relisait un `onHand` d'avant la première, elle poserait
    // 2000 — le chiffre de la dernière livraison, pas la moyenne.
    const h = makeHarness({
      orders: [ordre()],
      lines: [
        ligne({ id: 'pol-1', orderedQty: 7, unitCostCents: 1000 }),
        ligne({
          id: 'pol-2',
          variantId: 'v-1',
          orderedQty: 3,
          unitCostCents: 2000,
        }),
      ],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 7 }],
    });
    expect(h.variants[0].avgCostCents).toBe(1000);

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-2', receivedQty: 3 }],
    });

    expect(h.variants[0].onHand).toBe(10);
    expect(h.variants[0].avgCostCents).toBe(1300);
  });

  it('ne touche PAS au coût pour une ligne reçue à ZÉRO', async () => {
    // Rien n'est entré : pondérer par zéro unité ne dirait rien, et une
    // division par (onHand + 0) sur un stock vide diviserait par zéro.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20, unitCostCents: 1500 })],
      variants: [variante({ onHand: 0, available: 0, avgCostCents: 0 })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 0,
          discrepancyReason: ShopReceiptDiscrepancyReason.SUPPLIER_SHORTAGE,
        },
      ],
    });

    expect(h.variants[0].avgCostCents).toBe(0);
    expect(h.variants[0].onHand).toBe(0);
  });

  it('n’écrit AUCUN coût si la réception est REFUSÉE', async () => {
    // La garantie tient parce que le coût est écrit DANS la transaction du
    // mouvement : un coût committé qui survivrait à l'annulation de la
    // réception serait un chiffre que plus rien n'explique.
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.CANCELLED })],
      lines: [ligne({ orderedQty: 10, unitCostCents: 900 })],
      variants: [variante({ onHand: 5, available: 5, avgCostCents: 700 })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 10 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(h.variants[0].avgCostCents).toBe(700);
  });

  it('pondère chaque DÉCLINAISON séparément', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [
        ligne({ id: 'pol-1', variantId: 'v-1', orderedQty: 4, unitCostCents: 500 }),
        ligne({ id: 'pol-2', variantId: 'v-2', orderedQty: 4, unitCostCents: 2500 }),
      ],
      variants: [variante({ id: 'v-1' }), variante({ id: 'v-2' })],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        { orderLineId: 'pol-1', receivedQty: 4 },
        { orderLineId: 'pol-2', receivedQty: 4 },
      ],
    });

    expect(h.variants[0].avgCostCents).toBe(500);
    expect(h.variants[1].avgCostCents).toBe(2500);
  });
});

// ====================================================================
// Rapprochement facture / commande — ADR-0013 §1
// ====================================================================

describe('linkInvoice — le lien, JAMAIS l’écriture', () => {
  it('rattache une écriture DÉJÀ SAISIE à la commande', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne()],
      entries: [ecriture()],
    });

    await h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' });

    expect(h.entries[0].purchaseOrderId).toBe('po-1');
  });

  it('ne CRÉE aucune écriture comptable — ni au lien, ni à la réception', async () => {
    // LA ligne à ne pas franchir (ADR-0013 §1). Le grand livre est en
    // trésorerie : l'écriture naît au paiement du fournisseur, saisie par le
    // trésorier. Ni la réception ni le rapprochement n'en fabriquent une.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 10, unitCostCents: 900 })],
      entries: [ecriture()],
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [{ orderLineId: 'pol-1', receivedQty: 10 }],
    });
    await h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' });

    expect(h.entries).toHaveLength(1); // celle du fixture, et rien d'autre
  });

  it('REFUSE l’écriture d’un AUTRE club, et ne la rattache pas', async () => {
    // Le clubId est dans l'écriture conditionnelle, pas dans une lecture :
    // connaître l'identifiant d'une écriture voisine ne suffit pas.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne()],
      entries: [ecriture({ clubId: 'club-2' })],
    });

    await expect(
      h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' }),
    ).rejects.toThrow(BadRequestException);

    expect(h.entries[0].purchaseOrderId).toBeNull();
  });

  it('REFUSE de VOLER une facture déjà rattachée à une autre commande', async () => {
    // Le bug que ce test ferme : sans prédicat sur `purchaseOrderId`, le
    // rattachement écrasait le lien existant. La commande po-2 perdait son
    // rapprochement EN SILENCE — pas d'erreur, pas de trace, et l'écart ne se
    // serait vu qu'au contrôle comptable, des mois plus tard.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne()],
      entries: [ecriture({ purchaseOrderId: 'po-2' })],
    });

    await expect(
      h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' }),
    ).rejects.toThrow(BadRequestException);

    // L'essentiel : le lien d'origine est INTACT.
    expect(h.entries[0].purchaseOrderId).toBe('po-2');
  });

  it('TOLÈRE de rejouer un rattachement identique', async () => {
    // Le pendant du test précédent : interdire le vol ne doit pas rendre
    // l'opération non idempotente. Un double clic ou un rejeu réseau ferait
    // voir une erreur au trésorier là où il n'y a rien à corriger.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne()],
      entries: [ecriture({ purchaseOrderId: 'po-1' })],
    });

    await expect(
      h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' }),
    ).resolves.toBeDefined();

    expect(h.entries[0].purchaseOrderId).toBe('po-1');
  });

  it('REFUSE la commande d’un AUTRE club', async () => {
    const h = makeHarness({
      orders: [ordre({ clubId: 'club-2' })],
      lines: [ligne({ clubId: 'club-2' })],
      entries: [ecriture()],
    });

    await expect(
      h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' }),
    ).rejects.toThrow(NotFoundException);

    expect(h.entries[0].purchaseOrderId).toBeNull();
  });

  it('REFUSE une écriture ANNULÉE', async () => {
    // Rapprocher une facture annulée ferait mentir le total rapproché.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne()],
      entries: [ecriture({ cancelledAt: new Date('2026-07-16') })],
    });

    await expect(
      h.svc.linkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' }),
    ).rejects.toThrow(BadRequestException);

    expect(h.entries[0].purchaseOrderId).toBeNull();
  });

  it('détache, et laisse l’écriture INTACTE', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne()],
      entries: [ecriture({ purchaseOrderId: 'po-1' })],
    });

    await h.svc.unlinkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' });

    expect(h.entries).toHaveLength(1);
    expect(h.entries[0].purchaseOrderId).toBeNull();
    expect(h.entries[0].amountCents).toBe(18_000);
  });

  it('REFUSE de détacher d’une commande à laquelle l’écriture n’était PAS liée', async () => {
    const h = makeHarness({
      orders: [
        ordre({ id: 'po-1' }),
        ordre({ id: 'po-2', reference: 'CF-2026-005' }),
      ],
      lines: [ligne()],
      entries: [ecriture({ purchaseOrderId: 'po-2' })],
    });

    await expect(
      h.svc.unlinkInvoice(CLUB, { orderId: 'po-1', entryId: 'ae-1' }),
    ).rejects.toThrow(NotFoundException);

    expect(h.entries[0].purchaseOrderId).toBe('po-2');
  });

  it('propose 607000 via le mécanisme de mapping DÉJÀ en place', async () => {
    const h = makeHarness({ orders: [], lines: [] });

    const compte = await h.svc.proposedInvoiceAccount(CLUB);

    expect(compte.code).toBe('607000');
    expect(h.mapping.resolveAccountWithLabel).toHaveBeenCalledWith(
      CLUB,
      'SHOP_PURCHASE',
    );
  });
});

// ====================================================================
// Encours — onOrder
// ====================================================================

describe('onOrderByVariant — dérivé, jamais stocké', () => {
  it('somme les reliquats des commandes ENVOYÉES', async () => {
    const h = makeHarness({
      orders: [
        ordre({ id: 'po-1', status: ShopPurchaseOrderStatus.ORDERED }),
        ordre({
          id: 'po-2',
          reference: 'CF-2026-005',
          status: ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
        }),
      ],
      lines: [
        ligne({ id: 'a', orderId: 'po-1', orderedQty: 20, receivedQty: 0 }),
        ligne({ id: 'b', orderId: 'po-2', orderedQty: 10, receivedQty: 4 }),
      ],
    });

    const encours = await h.svc.onOrderByVariant(CLUB, ['v-1']);

    expect(encours.get('v-1')).toBe(26); // 20 + (10 − 4)
  });

  it('ne compte NI les lignes closes NI les commandes annulées', async () => {
    // Les deux moitiés du rapprochement. Une ligne close courte n'arrivera
    // jamais ; une commande annulée non plus. Les compter ferait croire à un
    // encours qui n'existe pas, et le club ne recommanderait pas.
    const h = makeHarness({
      orders: [
        ordre({ id: 'po-1', status: ShopPurchaseOrderStatus.ORDERED }),
        ordre({
          id: 'po-2',
          reference: 'CF-2026-005',
          status: ShopPurchaseOrderStatus.CANCELLED,
        }),
        ordre({
          id: 'po-3',
          reference: 'CF-2026-006',
          status: ShopPurchaseOrderStatus.DRAFT,
        }),
      ],
      lines: [
        // Close courte : plus rien n'est attendu dessus.
        ligne({
          id: 'a',
          orderId: 'po-1',
          orderedQty: 20,
          receivedQty: 17,
          closed: true,
        }),
        // Encore ouverte, sur une commande envoyée : celle-là compte.
        ligne({ id: 'b', orderId: 'po-1', orderedQty: 8, receivedQty: 3 }),
        // Commande annulée.
        ligne({ id: 'c', orderId: 'po-2', orderedQty: 50, receivedQty: 0 }),
        // Encore un brouillon : rien n'a été commandé.
        ligne({ id: 'd', orderId: 'po-3', orderedQty: 30, receivedQty: 0 }),
      ],
    });

    const encours = await h.svc.onOrderByVariant(CLUB, ['v-1']);

    expect(encours.get('v-1')).toBe(5); // 8 − 3, et rien d'autre
  });

  it('ignore les lignes d’un AUTRE club', async () => {
    const h = makeHarness({
      orders: [ordre({ id: 'po-1', clubId: 'club-2' })],
      lines: [ligne({ id: 'a', clubId: 'club-2', orderedQty: 20 })],
    });

    const encours = await h.svc.onOrderByVariant(CLUB, ['v-1']);

    expect(encours.get('v-1')).toBeUndefined();
  });

  it('suit la réception : l’encours FOND à mesure que la marchandise arrive', async () => {
    // Le test qui relie les deux moitiés du lot. Si `receivedQty` cessait
    // d'être maintenu, l'encours resterait à 20 pour toujours.
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    expect((await h.svc.onOrderByVariant(CLUB, ['v-1'])).get('v-1')).toBe(20);

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        {
          orderLineId: 'pol-1',
          receivedQty: 17,
          discrepancyReason: ShopReceiptDiscrepancyReason.BACKORDER,
        },
      ],
    });

    expect((await h.svc.onOrderByVariant(CLUB, ['v-1'])).get('v-1')).toBe(3);
  });
});

// ====================================================================
// Machine à états de la commande
// ====================================================================

describe('sendOrder / cancelOrder — transitions arbitrées par l’écriture', () => {
  it('DRAFT → ORDERED, avec l’arrivée attendue dérivée du délai fournisseur', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT, orderedAt: null })],
      lines: [ligne()],
      suppliers: [{ id: 'sup-1', clubId: CLUB, active: true, leadTimeDays: 7 }],
    });

    await h.svc.sendOrder(CLUB, 'po-1');

    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.ORDERED);
    expect(h.orders[0].orderedAt).not.toBeNull();
    const jours =
      (h.orders[0].expectedAt!.getTime() - h.orders[0].orderedAt!.getTime()) /
      86_400_000;
    expect(jours).toBe(7);
  });

  it('REFUSE d’envoyer une commande DÉJÀ envoyée', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.ORDERED })],
      lines: [ligne()],
    });

    await expect(h.svc.sendOrder(CLUB, 'po-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('REFUSE d’envoyer une commande VIDE', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [],
    });

    await expect(h.svc.sendOrder(CLUB, 'po-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('REFUSE d’envoyer la commande d’un AUTRE club', async () => {
    const h = makeHarness({
      orders: [ordre({ clubId: 'club-2', status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [ligne({ clubId: 'club-2' })],
    });

    await expect(h.svc.sendOrder(CLUB, 'po-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.DRAFT);
  });

  it('REFUSE d’annuler une commande DÉJÀ REÇUE', async () => {
    // La marchandise est entrée en stock ; un statut CANCELLED contredirait
    // les mouvements qui l'attestent.
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.RECEIVED })],
      lines: [ligne({ receivedQty: 20, closed: true })],
    });

    await expect(h.svc.cancelOrder(CLUB, 'po-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.RECEIVED);
  });

  it('annule une commande ENVOYÉE et la sort de l’encours', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.ORDERED })],
      lines: [ligne({ orderedQty: 20 })],
    });

    await h.svc.cancelOrder(CLUB, 'po-1');

    expect(h.orders[0].status).toBe(ShopPurchaseOrderStatus.CANCELLED);
    expect(h.orders[0].closedAt).not.toBeNull();
    expect((await h.svc.onOrderByVariant(CLUB, ['v-1'])).get('v-1')).toBeUndefined();
  });
});

describe('addLine / removeLine — modifiables tant que c’est un brouillon', () => {
  it('ajoute une ligne à un BROUILLON', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [],
    });

    await h.svc.addLine(CLUB, {
      orderId: 'po-1',
      variantId: 'v-1',
      orderedQty: 12,
      unitCostCents: 850,
    });

    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toMatchObject({ orderedQty: 12, unitCostCents: 850 });
  });

  it('REFUSE d’ajouter une ligne à une commande DÉJÀ ENVOYÉE', async () => {
    // Sans cette garde, une ligne se glisserait dans l'encours sans que
    // personne l'ait jamais commandée au fournisseur.
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.ORDERED })],
      lines: [],
    });

    await expect(
      h.svc.addLine(CLUB, { orderId: 'po-1', variantId: 'v-1', orderedQty: 5 }),
    ).rejects.toThrow(BadRequestException);
    expect(h.lines).toHaveLength(0);
  });

  it('REFUSE une déclinaison d’un AUTRE club', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [],
      variants: [variante({ clubId: 'club-2' })],
    });

    await expect(
      h.svc.addLine(CLUB, { orderId: 'po-1', variantId: 'v-1', orderedQty: 5 }),
    ).rejects.toThrow(BadRequestException);
    expect(h.lines).toHaveLength(0);
  });

  it('retire une ligne d’un BROUILLON, mais pas d’une commande envoyée', async () => {
    const brouillon = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [ligne()],
    });
    await brouillon.svc.removeLine(CLUB, {
      orderId: 'po-1',
      lineId: 'pol-1',
    });
    expect(brouillon.lines).toHaveLength(0);

    const envoyee = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.ORDERED })],
      lines: [ligne()],
    });
    await expect(
      envoyee.svc.removeLine(CLUB, { orderId: 'po-1', lineId: 'pol-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(envoyee.lines).toHaveLength(1);
  });
});

describe('prix d’achat par défaut — celui du fournisseur de la commande (ADR-0021 §1)', () => {
  const offres = [
    { id: 'off-1', clubId: CLUB, productId: 'p-1', supplierId: 'sup-1', unitCostCents: 850 },
    // Un autre fournisseur du même produit : son prix n'est pas celui de la commande.
    { id: 'off-2', clubId: CLUB, productId: 'p-1', supplierId: 'sup-2', unitCostCents: 700 },
  ];
  const variantes = () => [
    variante({ id: 'v-1', productId: 'p-1' }),
    variante({ id: 'v-2', productId: 'p-1' }),
  ];

  it('une ligne sans prix prend l’exception de sa déclinaison, sinon l’offre du fournisseur', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [],
      variants: variantes(),
      offers: offres,
      overrides: [
        // Exception chez L'AUTRE fournisseur : elle ne vaut pas pour cette commande.
        { id: 'ovr-9', clubId: CLUB, offerId: 'off-2', variantId: 'v-1', unitCostCents: 650 },
        { id: 'ovr-1', clubId: CLUB, offerId: 'off-1', variantId: 'v-2', unitCostCents: 990 },
      ],
    });

    await h.svc.addLine(CLUB, { orderId: 'po-1', variantId: 'v-1', orderedQty: 10 });
    await h.svc.addLine(CLUB, { orderId: 'po-1', variantId: 'v-2', orderedQty: 5 });

    expect(h.lines.map((l) => [l.variantId, l.unitCostCents])).toEqual([
      ['v-1', 850],
      ['v-2', 990],
    ]);
  });

  it('un prix saisi l’emporte, et sans offre chez ce fournisseur la ligne reste à 0', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT, supplierId: 'sup-3' })],
      lines: [],
      variants: variantes(),
      offers: offres,
      suppliers: [{ id: 'sup-3', clubId: CLUB, active: true, leadTimeDays: null }],
    });

    await h.svc.addLine(CLUB, { orderId: 'po-1', variantId: 'v-1', orderedQty: 10 });
    await h.svc.addLine(CLUB, {
      orderId: 'po-1',
      variantId: 'v-2',
      orderedQty: 5,
      unitCostCents: 1200,
    });

    expect(h.lines.map((l) => [l.variantId, l.unitCostCents])).toEqual([
      ['v-1', 0],
      ['v-2', 1200],
    ]);
  });

  it('les lignes d’une commande créée d’un coup reçoivent le même prix par défaut', async () => {
    const h = makeHarness({
      orders: [],
      lines: [],
      variants: variantes(),
      offers: offres,
      overrides: [
        { id: 'ovr-1', clubId: CLUB, offerId: 'off-1', variantId: 'v-2', unitCostCents: 990 },
      ],
    });

    await h.svc.createOrder(CLUB, {
      supplierId: 'sup-1',
      lines: [
        { variantId: 'v-1', orderedQty: 10 },
        { variantId: 'v-2', orderedQty: 5 },
      ],
    });

    // Le double range la commande avec ses lignes imbriquées, telles qu'écrites.
    const cree = h.orders[0] as unknown as {
      lines: { create: Array<{ variantId: string; unitCostCents: number }> };
    };
    expect(cree.lines.create.map((l) => [l.variantId, l.unitCostCents])).toEqual([
      ['v-1', 850],
      ['v-2', 990],
    ]);
  });
});

describe('createOrder — la référence est arbitrée par la base', () => {
  it('engendre une référence lisible, incrémentée sur l’année', async () => {
    const annee = new Date().getFullYear();
    const h = makeHarness({
      orders: [ordre({ id: 'po-0', reference: `CF-${annee}-003` })],
      lines: [],
    });

    await h.svc.createOrder(CLUB, {
      supplierId: 'sup-1',
      lines: [{ variantId: 'v-1', orderedQty: 4 }],
    });

    const cree = h.orders.find((o) => o.id !== 'po-0')!;
    expect(cree.reference).toBe(`CF-${annee}-004`);
    expect(cree.status).toBe(ShopPurchaseOrderStatus.DRAFT);
  });

  it('ne se laisse PAS piéger par l’ordre lexicographique au millième bon', async () => {
    // « CF-2026-1000 » se classe AVANT « CF-2026-999 » en tri SQL : un
    // `orderBy: desc` proposerait indéfiniment un numéro déjà pris.
    const annee = new Date().getFullYear();
    const h = makeHarness({
      orders: [
        ordre({ id: 'po-a', reference: `CF-${annee}-999` }),
        ordre({ id: 'po-b', reference: `CF-${annee}-1000` }),
      ],
      lines: [],
    });

    await h.svc.createOrder(CLUB, { supplierId: 'sup-1' });

    const cree = h.orders.find((o) => !['po-a', 'po-b'].includes(o.id))!;
    expect(cree.reference).toBe(`CF-${annee}-1001`);
  });

  it('REFUSE un fournisseur d’un AUTRE club', async () => {
    const h = makeHarness({
      orders: [],
      lines: [],
      suppliers: [
        { id: 'sup-1', clubId: 'club-2', active: true, leadTimeDays: null },
      ],
    });

    await expect(
      h.svc.createOrder(CLUB, { supplierId: 'sup-1' }),
    ).rejects.toThrow(BadRequestException);
    expect(h.orders).toHaveLength(0);
  });

  it('REFUSE un fournisseur DÉSACTIVÉ', async () => {
    const h = makeHarness({
      orders: [],
      lines: [],
      suppliers: [
        { id: 'sup-1', clubId: CLUB, active: false, leadTimeDays: null },
      ],
    });

    await expect(
      h.svc.createOrder(CLUB, { supplierId: 'sup-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('REFUSE deux lignes pour la même déclinaison', async () => {
    const h = makeHarness({ orders: [], lines: [] });

    await expect(
      h.svc.createOrder(CLUB, {
        supplierId: 'sup-1',
        lines: [
          { variantId: 'v-1', orderedQty: 4 },
          { variantId: 'v-1', orderedQty: 2 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(h.orders).toHaveLength(0);
  });
});

describe('createRestockOrders — un brouillon par fournisseur (ADR-0021 §4)', () => {
  const annee = new Date().getFullYear();
  const catalogue = () => ({
    variants: [
      variante({ id: 'v-1', productId: 'p-1' }),
      variante({ id: 'v-2', productId: 'p-2' }),
    ],
    suppliers: [
      { id: 'sup-1', clubId: CLUB, active: true, leadTimeDays: 7 },
      { id: 'sup-2', clubId: CLUB, active: true, leadTimeDays: null },
    ],
    offers: [
      { id: 'off-1', clubId: CLUB, productId: 'p-1', supplierId: 'sup-1', unitCostCents: 850 },
      { id: 'off-2', clubId: CLUB, productId: 'p-2', supplierId: 'sup-2', unitCostCents: 700 },
    ],
  });

  it('crée un brouillon par fournisseur, au prix de l’offre quand aucun n’est saisi', async () => {
    const base = catalogue();
    const h = makeHarness({
      orders: [],
      lines: [],
      ...base,
      variants: [...base.variants, variante({ id: 'v-3', productId: 'p-1' })],
    });

    const res = await h.svc.createRestockOrders(CLUB, [
      { variantId: 'v-1', supplierId: 'sup-1', qty: 10 },
      { variantId: 'v-2', supplierId: 'sup-2', qty: 5, unitCostCents: 650 },
      { variantId: 'v-3', supplierId: 'sup-1', qty: 4 },
    ]);

    expect(res.map((r) => [r.created, r.lineCount])).toEqual([
      [true, 2],
      [true, 1],
    ]);
    expect(h.orders.map((o) => [o.supplierId, o.reference, o.status])).toEqual([
      ['sup-1', `CF-${annee}-001`, ShopPurchaseOrderStatus.DRAFT],
      ['sup-2', `CF-${annee}-002`, ShopPurchaseOrderStatus.DRAFT],
    ]);
    expect(h.lines.map((l) => [l.orderId, l.variantId, l.orderedQty, l.unitCostCents])).toEqual([
      [h.orders[0].id, 'v-1', 10, 850],
      [h.orders[0].id, 'v-3', 4, 850],
      [h.orders[1].id, 'v-2', 5, 650],
    ]);
  });

  it('complète le brouillon ouvert du fournisseur : la quantité s’ajoute, sans seconde ligne', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT, supplierId: 'sup-1' })],
      lines: [ligne({ variantId: 'v-1', orderedQty: 4, unitCostCents: 0 })],
      ...catalogue(),
    });

    const res = await h.svc.createRestockOrders(CLUB, [
      { variantId: 'v-1', supplierId: 'sup-1', qty: 6 },
    ]);

    expect(res.map((r) => r.created)).toEqual([false]);
    expect(h.orders).toHaveLength(1);
    // Le prix inconnu (0) de la ligne existante est renseigné au passage.
    expect(h.lines.map((l) => [l.orderedQty, l.unitCostCents])).toEqual([[10, 850]]);
  });

  it('garde le prix déjà saisi sur la ligne qu’il complète', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT, supplierId: 'sup-1' })],
      lines: [ligne({ variantId: 'v-1', orderedQty: 4, unitCostCents: 900 })],
      ...catalogue(),
    });

    await h.svc.createRestockOrders(CLUB, [{ variantId: 'v-1', supplierId: 'sup-1', qty: 6 }]);

    expect(h.lines.map((l) => [l.orderedQty, l.unitCostCents])).toEqual([[10, 900]]);
  });

  it('complète le brouillon le plus récemment modifié du fournisseur', async () => {
    const h = makeHarness({
      orders: [
        ordre({
          id: 'po-ancien',
          status: ShopPurchaseOrderStatus.DRAFT,
          reference: `CF-${annee}-010`,
          updatedAt: new Date('2026-09-01'),
        }),
        ordre({
          id: 'po-recent',
          status: ShopPurchaseOrderStatus.DRAFT,
          reference: `CF-${annee}-011`,
          updatedAt: new Date('2026-09-10'),
        }),
      ],
      lines: [],
      ...catalogue(),
    });

    await h.svc.createRestockOrders(CLUB, [{ variantId: 'v-1', supplierId: 'sup-1', qty: 3 }]);

    expect(h.lines.map((l) => l.orderId)).toEqual(['po-recent']);
  });

  it('refuse un fournisseur qui n’est pas rattaché au produit, sans rien créer', async () => {
    const h = makeHarness({ orders: [], lines: [], ...catalogue() });

    await expect(
      h.svc.createRestockOrders(CLUB, [
        { variantId: 'v-1', supplierId: 'sup-1', qty: 10 },
        // p-2 ne se fournit pas chez sup-1.
        { variantId: 'v-2', supplierId: 'sup-1', qty: 5 },
      ]),
    ).rejects.toThrow('n’est pas rattaché');
    expect(h.orders).toHaveLength(0);
    expect(h.lines).toHaveLength(0);
  });

  it('refuse un fournisseur désactivé', async () => {
    const base = catalogue();
    const h = makeHarness({
      orders: [],
      lines: [],
      ...base,
      suppliers: [{ ...base.suppliers[0], active: false }, base.suppliers[1]],
    });

    await expect(
      h.svc.createRestockOrders(CLUB, [{ variantId: 'v-1', supplierId: 'sup-1', qty: 10 }]),
    ).rejects.toThrow('désactivé');
    expect(h.orders).toHaveLength(0);
  });

  it('refuse une déclinaison d’un autre club, et une même déclinaison deux fois', async () => {
    const base = catalogue();
    const autreClub = makeHarness({
      orders: [],
      lines: [],
      ...base,
      variants: [variante({ id: 'v-1', productId: 'p-1', clubId: 'club-2' }), base.variants[1]],
    });
    await expect(
      autreClub.svc.createRestockOrders(CLUB, [{ variantId: 'v-1', supplierId: 'sup-1', qty: 10 }]),
    ).rejects.toThrow('Déclinaison introuvable.');

    const doublon = makeHarness({ orders: [], lines: [], ...base });
    await expect(
      doublon.svc.createRestockOrders(CLUB, [
        { variantId: 'v-1', supplierId: 'sup-1', qty: 10 },
        { variantId: 'v-1', supplierId: 'sup-1', qty: 2 },
      ]),
    ).rejects.toThrow('deux fois');

    expect([...autreClub.orders, ...doublon.orders]).toHaveLength(0);
  });

  it('ne complète ni une commande déjà envoyée, ni le brouillon d’un autre fournisseur', async () => {
    const h = makeHarness({
      orders: [
        ordre({
          id: 'po-envoyee',
          status: ShopPurchaseOrderStatus.ORDERED,
          reference: `CF-${annee}-001`,
        }),
        ordre({
          id: 'po-autre',
          status: ShopPurchaseOrderStatus.DRAFT,
          supplierId: 'sup-2',
          reference: `CF-${annee}-002`,
        }),
      ],
      lines: [ligne({ id: 'pol-envoyee', orderId: 'po-envoyee', variantId: 'v-1', orderedQty: 20 })],
      ...catalogue(),
    });

    const res = await h.svc.createRestockOrders(CLUB, [
      { variantId: 'v-1', supplierId: 'sup-1', qty: 3 },
    ]);

    expect(res.map((r) => r.created)).toEqual([true]);
    expect(h.orders.map((o) => [o.supplierId, o.reference, o.status])).toEqual([
      ['sup-1', `CF-${annee}-001`, ShopPurchaseOrderStatus.ORDERED],
      ['sup-2', `CF-${annee}-002`, ShopPurchaseOrderStatus.DRAFT],
      ['sup-1', `CF-${annee}-003`, ShopPurchaseOrderStatus.DRAFT],
    ]);
    // La ligne de la commande envoyée reste intacte : la quantité va au brouillon neuf.
    expect(h.lines.map((l) => [l.orderId, l.orderedQty])).toEqual([
      ['po-envoyee', 20],
      [h.orders[2].id, 3],
    ]);
  });

  it('un envoi qui se glisse entre la lecture et la réclamation : refus, rien ne s’ajoute à une commande partie', async () => {
    const h = makeHarness({
      orders: [ordre({ status: ShopPurchaseOrderStatus.DRAFT })],
      lines: [],
      ...catalogue(),
    });
    const lire = h.orderTable.findFirst.getMockImplementation()!;
    h.orderTable.findFirst.mockImplementationOnce(async (args) => {
      const brouillon = await lire(args);
      // L’envoi fait depuis un autre onglet se committe juste après la lecture.
      h.orders[0].status = ShopPurchaseOrderStatus.ORDERED;
      return brouillon;
    });

    await expect(
      h.svc.createRestockOrders(CLUB, [{ variantId: 'v-1', supplierId: 'sup-1', qty: 6 }]),
    ).rejects.toThrow('déjà envoyée');
    expect(h.lines).toHaveLength(0);
  });

  it('refuse une liste vide, une quantité nulle et un prix négatif, sans rien créer', async () => {
    const h = makeHarness({ orders: [], lines: [], ...catalogue() });
    const v1 = { variantId: 'v-1', supplierId: 'sup-1' };

    await expect(h.svc.createRestockOrders(CLUB, [])).rejects.toThrow('aucune ligne');
    await expect(h.svc.createRestockOrders(CLUB, [{ ...v1, qty: 0 }])).rejects.toThrow(
      'au moins une unité',
    );
    await expect(
      h.svc.createRestockOrders(CLUB, [{ ...v1, qty: 2, unitCostCents: -1 }]),
    ).rejects.toThrow('négatif');
    expect(h.orders).toHaveLength(0);
    expect(h.lines).toHaveLength(0);
  });

  it('refuse le fournisseur d’un autre club', async () => {
    const base = catalogue();
    const h = makeHarness({
      orders: [],
      lines: [],
      ...base,
      suppliers: [{ ...base.suppliers[0], clubId: 'club-2' }, base.suppliers[1]],
    });

    await expect(
      h.svc.createRestockOrders(CLUB, [{ variantId: 'v-1', supplierId: 'sup-1', qty: 10 }]),
    ).rejects.toThrow('Fournisseur introuvable.');
    expect(h.orders).toHaveLength(0);
  });

  it('une référence perdue à la course : toute la transaction est rejouée, rien n’est doublé', async () => {
    const h = makeHarness({ orders: [], lines: [], ...catalogue() });
    const original = h.orderTable.create.getMockImplementation()!;
    let lost = false;
    h.orderTable.create.mockImplementation(async (args: { data: any }) => {
      if (!lost && args.data.supplierId === 'sup-2') {
        lost = true;
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
      return original(args);
    });

    await h.svc.createRestockOrders(CLUB, [
      { variantId: 'v-1', supplierId: 'sup-1', qty: 10 },
      { variantId: 'v-2', supplierId: 'sup-2', qty: 5 },
    ]);

    expect(lost).toBe(true);
    expect(h.orders.map((o) => o.supplierId)).toEqual(['sup-1', 'sup-2']);
    // Chaque ligne au prix de SON fournisseur : l’offre d’un autre ne sert jamais.
    expect(h.lines.map((l) => [l.variantId, l.unitCostCents])).toEqual([
      ['v-1', 850],
      ['v-2', 700],
    ]);
  });
});

describe('draftQtyByVariant — ce que les brouillons portent déjà (ADR-0021 §3)', () => {
  it('compte les brouillons, pas les commandes envoyées ni annulées', async () => {
    const h = makeHarness({
      orders: [
        ordre({ id: 'po-b', status: ShopPurchaseOrderStatus.DRAFT }),
        ordre({
          id: 'po-b2',
          status: ShopPurchaseOrderStatus.DRAFT,
          supplierId: 'sup-2',
          reference: 'CF-2026-007',
        }),
        ordre({ id: 'po-e', status: ShopPurchaseOrderStatus.ORDERED, reference: 'CF-2026-005' }),
        ordre({ id: 'po-a', status: ShopPurchaseOrderStatus.CANCELLED, reference: 'CF-2026-006' }),
      ],
      lines: [
        ligne({ id: 'l-1', orderId: 'po-b', variantId: 'v-1', orderedQty: 4 }),
        ligne({ id: 'l-2', orderId: 'po-e', variantId: 'v-1', orderedQty: 20 }),
        ligne({ id: 'l-3', orderId: 'po-a', variantId: 'v-1', orderedQty: 7 }),
        ligne({ id: 'l-4', orderId: 'po-b2', variantId: 'v-1', orderedQty: 3 }),
      ],
    });

    const drafts = await h.svc.draftQtyByVariant(CLUB);

    // 4 + 3 : deux brouillons, chez deux fournisseurs ; ni l’envoyée ni l’annulée.
    expect(drafts.get('v-1')).toBe(7);
  });
});

describe('receiveOrder — l’arrivage sert les précommandes (ADR-0018)', () => {
  it('déclenche l’attribution APRÈS la réception, pour les seules déclinaisons arrivées', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [
        ligne({ id: 'pol-1', variantId: 'v-1', orderedQty: 5 }),
        ligne({ id: 'pol-2', variantId: 'v-2', orderedQty: 5 }),
      ],
      variants: [variante({ id: 'v-1' }), variante({ id: 'v-2' })],
    });
    let depthAtCall = -1;
    let onHandAtCall = -1;
    h.preorders.allocateQuietly.mockImplementation(async () => {
      depthAtCall = h.txDepth();
      onHandAtCall = h.variants[0].onHand;
    });

    await h.svc.receiveOrder(CLUB, {
      orderId: 'po-1',
      lines: [
        { orderLineId: 'pol-1', receivedQty: 5 },
        {
          orderLineId: 'pol-2',
          receivedQty: 0,
          discrepancyReason: ShopReceiptDiscrepancyReason.BACKORDER,
        },
      ],
    });

    expect(h.preorders.allocateQuietly).toHaveBeenCalledTimes(1);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith(CLUB, ['v-1']);
    expect(depthAtCall).toBe(0);
    expect(onHandAtCall).toBe(5);
  });

  it('une réception refusée ne sert rien', async () => {
    const h = makeHarness({
      orders: [ordre()],
      lines: [ligne({ orderedQty: 20 })],
    });

    await expect(
      h.svc.receiveOrder(CLUB, {
        orderId: 'po-1',
        lines: [{ orderLineId: 'pol-1', receivedQty: 17 }],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(h.preorders.allocateQuietly).not.toHaveBeenCalled();
  });
});
