import { Logger } from '@nestjs/common';
import { ShopOrderStatus, ShopStockMovementKind } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ShopPreorderService } from './shop-preorder.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Attribution des arrivages aux précommandes — ADR-0018.
 *
 * Vrais `ShopPreorderService` et `ShopStockService` ; seul Prisma est doublé.
 * Le double APPLIQUE chaque clause du `where`, relation `order` comprise, et
 * LÈVE sur toute clause qu'il ne sait pas simuler : un double qui ignore une
 * clause la rend facultative pour le service
 * (cf. pitfalls/double-ignore-une-clause-du-where.md). Il ne trie que si le
 * service le demande et rend sinon les lignes dans l'ordre d'insertion — c'est
 * ce qui fait mordre « première commande passée, première servie ». La
 * transaction annule réellement ses écritures quand elle lève.
 */

const CLUB = 'club-1';

type OrderRow = {
  id: string;
  clubId: string;
  status: ShopOrderStatus;
  createdAt: Date;
  updatedAt: Date;
  fulfilledAt: Date | null;
};

type LineRow = {
  id: string;
  orderId: string;
  variantId: string | null;
  quantity: number;
  /** Unités retirées de la commande (ADR-0020). */
  cancelledQty: number;
  awaitingStockQty: number;
};

type VariantRow = {
  id: string;
  clubId: string;
  active: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  lowStockAlertedAt: Date | null;
  updatedAt: Date;
};

const commande = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o-1',
  clubId: CLUB,
  status: ShopOrderStatus.PENDING,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  fulfilledAt: null,
  ...over,
});

const ligne = (over: Partial<LineRow> = {}): LineRow => ({
  id: 'l-1',
  orderId: 'o-1',
  variantId: 'v-1',
  quantity: 2,
  cancelledQty: 0,
  awaitingStockQty: 2,
  ...over,
});

const declinaison = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'v-1',
  clubId: CLUB,
  active: true,
  trackStock: true,
  onHand: 0,
  available: 0,
  lowStockAlertedAt: null,
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  ...over,
});

/** Refuse toute clause que le double ne sait pas appliquer. */
function clauses(where: Record<string, unknown>, connues: string[]) {
  for (const cle of Object.keys(where)) {
    if (!connues.includes(cle)) {
      throw new Error(`Clause non simulée par le double : ${cle}`);
    }
  }
}

/** Égalité, ou `{ in: [...] }`. */
function egal(valeur: unknown, clause: any): boolean {
  if (clause === undefined) return true;
  if (clause !== null && typeof clause === 'object') {
    clauses(clause, ['in']);
    return (clause.in as unknown[]).includes(valeur);
  }
  return valeur === clause;
}

/** Entier : égalité, `gt`, `gte`. */
function entier(valeur: number, clause: any): boolean {
  if (clause === undefined) return true;
  if (typeof clause === 'number') return valeur === clause;
  clauses(clause, ['gt', 'gte']);
  return (
    (clause.gt === undefined || valeur > clause.gt) &&
    (clause.gte === undefined || valeur >= clause.gte)
  );
}

/** Écrit `{ increment }`, `{ decrement }` ou une valeur. */
function ecrit(row: Record<string, any>, data: Record<string, any>) {
  for (const [cle, valeur] of Object.entries(data)) {
    if (
      valeur !== null &&
      typeof valeur === 'object' &&
      !(valeur instanceof Date)
    ) {
      clauses(valeur, ['increment', 'decrement']);
      row[cle] += (valeur.increment ?? 0) - (valeur.decrement ?? 0);
    } else {
      row[cle] = valeur;
    }
  }
}

function makeStore(seed: {
  orders: OrderRow[];
  lines: LineRow[];
  variants: VariantRow[];
}) {
  const { orders, lines, variants } = seed;
  const movements: Array<Record<string, any>> = [];
  const orderOf = (l: LineRow) => orders.find((o) => o.id === l.orderId)!;

  const orderMatches = (o: OrderRow, where: any) => {
    clauses(where, ['id', 'clubId', 'status', 'fulfilledAt']);
    if (where.fulfilledAt !== undefined && where.fulfilledAt !== null) {
      throw new Error('Clause fulfilledAt non simulée par le double');
    }
    return (
      egal(o.id, where.id) &&
      egal(o.clubId, where.clubId) &&
      egal(o.status, where.status) &&
      (where.fulfilledAt === undefined || o.fulfilledAt === null)
    );
  };
  const lineMatches = (l: LineRow, where: any) => {
    clauses(where, ['id', 'orderId', 'variantId', 'awaitingStockQty', 'order']);
    return (
      egal(l.id, where.id) &&
      egal(l.orderId, where.orderId) &&
      egal(l.variantId, where.variantId) &&
      entier(l.awaitingStockQty, where.awaitingStockQty) &&
      (where.order === undefined || orderMatches(orderOf(l), where.order))
    );
  };
  const variantMatches = (v: VariantRow, where: any) => {
    clauses(where, ['id', 'clubId', 'active', 'trackStock', 'available', 'onHand']);
    return (
      egal(v.id, where.id) &&
      egal(v.clubId, where.clubId) &&
      egal(v.active, where.active) &&
      egal(v.trackStock, where.trackStock) &&
      entier(v.available, where.available) &&
      entier(v.onHand, where.onHand)
    );
  };

  const db: any = {
    shopOrder: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        hit.forEach((o) => ecrit(o, data));
        return { count: hit.length };
      }),
    },
    shopOrderLine: {
      findMany: jest.fn(async ({ where, select, include, orderBy }: any) => {
        let hit = lines.filter((l) => lineMatches(l, where));
        if (orderBy !== undefined) {
          // Seule forme employée : commande la plus ancienne, puis ligne.
          expect(orderBy).toEqual([
            { order: { createdAt: 'asc' } },
            { id: 'asc' },
          ]);
          hit = [...hit].sort(
            (a, b) =>
              orderOf(a).createdAt.getTime() - orderOf(b).createdAt.getTime() ||
              a.id.localeCompare(b.id),
          );
        }
        const avecCommande =
          include?.order !== undefined || select?.order !== undefined;
        return hit.map((l) => ({
          ...l,
          ...(avecCommande ? { order: { ...orderOf(l) } } : {}),
        }));
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = lines.filter((l) => lineMatches(l, where));
        hit.forEach((l) => ecrit(l, data));
        return { count: hit.length };
      }),
    },
    shopProductVariant: {
      findFirst: jest.fn(async ({ where }: any) => {
        const v = variants.find((x) => variantMatches(x, where));
        return v ? { ...v } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((v) => variantMatches(v, where));
        hit.forEach((v) => ecrit(v, data));
        return { count: hit.length };
      }),
      // Correction d'inventaire (`adjust`) : écriture par identifiant, après
      // sa lecture.
      update: jest.fn(async ({ where, data }: any) => {
        clauses(where, ['id']);
        const v = variants.find((x) => x.id === where.id);
        if (!v) throw new Error('Déclinaison introuvable');
        ecrit(v, data);
        return { ...v };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        movements.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = structuredClone({ orders, lines, variants, movements });
      try {
        return await fn(db);
      } catch (e) {
        orders.splice(0, orders.length, ...snap.orders);
        lines.splice(0, lines.length, ...snap.lines);
        variants.splice(0, variants.length, ...snap.variants);
        movements.splice(0, movements.length, ...snap.movements);
        throw e;
      }
    }),
  };

  const stock = new ShopStockService(db as unknown as PrismaService);
  const svc = new ShopPreorderService(db as unknown as PrismaService, stock);
  return { db, svc, stock, orders, lines, variants, movements };
}

const attente = (h: ReturnType<typeof makeStore>, lineId: string) =>
  h.lines.find((l) => l.id === lineId)!.awaitingStockQty;

describe('ShopPreorderService.allocate — l’arrivage sert les précommandes', () => {
  it('première commande passée, première servie — pas l’ordre d’insertion', async () => {
    // La plus RÉCENTE est en tête du tableau : sans tri demandé à la base, le
    // double la servirait la première.
    const h = makeStore({
      orders: [
        commande({ id: 'o-recente', createdAt: new Date('2026-09-05T10:00:00Z') }),
        commande({ id: 'o-ancienne', createdAt: new Date('2026-09-01T10:00:00Z') }),
      ],
      lines: [
        ligne({ id: 'l-recente', orderId: 'o-recente', awaitingStockQty: 2 }),
        ligne({ id: 'l-ancienne', orderId: 'o-ancienne', awaitingStockQty: 2 }),
      ],
      variants: [declinaison({ onHand: 3, available: 3 })],
    });

    await expect(h.svc.allocate(CLUB, 'v-1')).resolves.toBe(3);

    expect(attente(h, 'l-ancienne')).toBe(0);
    expect(attente(h, 'l-recente')).toBe(1);
    expect(h.variants[0].available).toBe(0);
    // Commandes EN ATTENTE de règlement : réservé, pas sorti du placard.
    expect(h.variants[0].onHand).toBe(3);
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.RESERVE,
        availableDelta: -2,
        orderLineId: 'l-ancienne',
      }),
      expect.objectContaining({
        kind: ShopStockMovementKind.RESERVE,
        availableDelta: -1,
        orderLineId: 'l-recente',
      }),
    ]);
  });

  it('commande PAYÉE : les unités arrivées sortent du stock à leur arrivée', async () => {
    // Payée suffit (ADR-0017) — même sans `fulfilledAt`, comme une commande
    // réglée avant son existence.
    const h = makeStore({
      orders: [commande({ status: ShopOrderStatus.PAID, fulfilledAt: null })],
      lines: [ligne({ awaitingStockQty: 2 })],
      variants: [declinaison({ onHand: 2, available: 2 })],
    });

    await h.svc.allocate(CLUB, 'v-1');

    expect(attente(h, 'l-1')).toBe(0);
    expect(h.variants[0]).toMatchObject({ onHand: 0, available: 0 });
    expect(h.movements.map((m) => m.kind)).toEqual([
      ShopStockMovementKind.RESERVE,
      ShopStockMovementKind.FULFILL,
    ]);
  });

  it('sortie posée sans règlement (ADR-0017) : sort aussi à l’arrivée', async () => {
    const h = makeStore({
      orders: [commande({ fulfilledAt: new Date('2026-09-02T10:00:00Z') })],
      lines: [ligne({ awaitingStockQty: 1 })],
      variants: [declinaison({ onHand: 1, available: 1 })],
    });

    await h.svc.allocate(CLUB, 'v-1');

    expect(h.variants[0]).toMatchObject({ onHand: 0, available: 0 });
  });

  it('laisse vendable ce que les précommandes ne prennent pas', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ awaitingStockQty: 2 })],
      variants: [declinaison({ onHand: 5, available: 5 })],
    });

    await expect(h.svc.allocate(CLUB, 'v-1')).resolves.toBe(2);

    expect(h.variants[0].available).toBe(3);
  });

  it('ne sert ni une commande annulée, ni la déclinaison d’un autre club', async () => {
    const h = makeStore({
      orders: [
        commande({
          id: 'o-annulee',
          status: ShopOrderStatus.CANCELLED,
          createdAt: new Date('2026-08-01T10:00:00Z'),
        }),
        commande({ id: 'o-1' }),
      ],
      lines: [
        ligne({ id: 'l-annulee', orderId: 'o-annulee', awaitingStockQty: 2 }),
        ligne({ id: 'l-1', orderId: 'o-1', awaitingStockQty: 1 }),
      ],
      variants: [declinaison({ onHand: 5, available: 5 })],
    });

    await expect(h.svc.allocate('club-2', 'v-1')).resolves.toBe(0);
    expect(h.variants[0].available).toBe(5);

    await expect(h.svc.allocate(CLUB, 'v-1')).resolves.toBe(1);
    expect(attente(h, 'l-annulee')).toBe(2);
    expect(attente(h, 'l-1')).toBe(0);
    expect(h.variants[0].available).toBe(4);
  });

  it('rien de vendable : ne verrouille aucune commande', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne()],
      variants: [declinaison({ onHand: 0, available: 0 })],
    });

    await expect(h.svc.allocate(CLUB, 'v-1')).resolves.toBe(0);

    expect(h.db.shopOrder.updateMany).not.toHaveBeenCalled();
    expect(attente(h, 'l-1')).toBe(2);
  });

  it('stock non suivi : tout ce qui attendait est servi, sans mouvement', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ awaitingStockQty: 2 })],
      variants: [declinaison({ trackStock: false })],
    });

    await expect(h.svc.allocate(CLUB, 'v-1')).resolves.toBe(2);

    expect(attente(h, 'l-1')).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('verrouille les commandes AVANT de toucher au stock — l’ordre du règlement', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ awaitingStockQty: 1 })],
      variants: [declinaison({ onHand: 1, available: 1 })],
    });

    await h.svc.allocate(CLUB, 'v-1');

    const verrou = h.db.shopOrder.updateMany.mock.invocationCallOrder[0];
    const stock = h.db.shopProductVariant.updateMany.mock.invocationCallOrder[0];
    expect(verrou).toBeDefined();
    expect(stock).toBeDefined();
    expect(verrou).toBeLessThan(stock);
  });

  it('relit SOUS le verrou : une commande annulée juste avant n’est pas servie', async () => {
    // L'annulation committe entre la première lecture et la prise du verrou.
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ awaitingStockQty: 1 })],
      variants: [declinaison({ onHand: 1, available: 1 })],
    });
    const verrouiller = h.db.shopOrder.updateMany.getMockImplementation();
    h.db.shopOrder.updateMany.mockImplementationOnce(async (args: any) => {
      h.orders[0].status = ShopOrderStatus.CANCELLED;
      return verrouiller(args);
    });

    await expect(h.svc.allocate(CLUB, 'v-1')).resolves.toBe(0);

    expect(h.variants[0].available).toBe(1);
    expect(h.movements).toHaveLength(0);
  });

  it('une ligne modifiée pendant l’attribution annule tout, réservation comprise', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ awaitingStockQty: 2 })],
      variants: [declinaison({ onHand: 2, available: 2 })],
    });
    h.db.shopOrderLine.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(h.svc.allocate(CLUB, 'v-1')).rejects.toThrow(
      /modifiée pendant l'attribution/,
    );

    expect(h.variants[0].available).toBe(2);
    expect(attente(h, 'l-1')).toBe(2);
    expect(h.movements).toHaveLength(0);
  });

  it('ne touche pas aux lignes d’une autre déclinaison', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [
        ligne({ id: 'l-1', awaitingStockQty: 1 }),
        ligne({ id: 'l-2', variantId: 'v-2', awaitingStockQty: 1 }),
      ],
      variants: [
        declinaison({ onHand: 5, available: 5 }),
        declinaison({ id: 'v-2', onHand: 5, available: 5 }),
      ],
    });

    await h.svc.allocate(CLUB, 'v-1');

    expect(attente(h, 'l-2')).toBe(1);
    expect(h.variants[1].available).toBe(5);
  });
});

describe('ShopPreorderService.allocateQuietly — après le commit de l’événement', () => {
  it('n’échoue jamais pour l’appelant, journalise, et passe aux déclinaisons suivantes', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [
        ligne({ id: 'l-1', awaitingStockQty: 1 }),
        ligne({ id: 'l-2', variantId: 'v-2', awaitingStockQty: 1 }),
      ],
      variants: [
        declinaison({ onHand: 1, available: 1 }),
        declinaison({ id: 'v-2', onHand: 1, available: 1 }),
      ],
    });
    const journal = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    h.db.$transaction.mockRejectedValueOnce(new Error('deadlock detected'));

    try {
      await expect(
        h.svc.allocateQuietly(CLUB, ['v-1', 'v-2', 'v-1']),
      ).resolves.toBeUndefined();

      expect(journal).toHaveBeenCalledWith(
        expect.stringContaining('deadlock detected'),
      );
      expect(attente(h, 'l-1')).toBe(1);
      expect(attente(h, 'l-2')).toBe(0);
      // Dédoublonné : v-1 n'est tenté qu'une fois.
      expect(h.db.$transaction).toHaveBeenCalledTimes(2);
    } finally {
      journal.mockRestore();
    }
  });
});

describe('ShopPreorderService.allocatePending — filet de sécurité du balayage', () => {
  const seed = () => ({
    orders: [commande({ id: 'o-1' }), commande({ id: 'o-2', clubId: 'club-2' })],
    lines: [
      ligne({ id: 'l-1', orderId: 'o-1', variantId: 'v-1', awaitingStockQty: 2 }),
      ligne({ id: 'l-2', orderId: 'o-2', variantId: 'v-9', awaitingStockQty: 1 }),
    ],
    variants: [
      declinaison({ onHand: 1, available: 1 }),
      declinaison({ id: 'v-9', clubId: 'club-2', onHand: 4, available: 4 }),
    ],
  });

  it('sert, club par club, tout ce qui peut l’être, et compte les unités servies', async () => {
    const h = makeStore(seed());

    await expect(h.svc.allocatePending()).resolves.toBe(2);

    expect(attente(h, 'l-1')).toBe(1);
    expect(attente(h, 'l-2')).toBe(0);
  });

  it('se limite au club demandé', async () => {
    const h = makeStore(seed());

    await expect(h.svc.allocatePending('club-2')).resolves.toBe(1);

    expect(attente(h, 'l-1')).toBe(2);
    expect(attente(h, 'l-2')).toBe(0);
  });
});

describe('ShopPreorderService.preorderedByVariant — ce que voit le trésorier', () => {
  it('additionne les unités en attente des commandes en cours du club, par déclinaison', async () => {
    const h = makeStore({
      orders: [
        commande({ id: 'o-1' }),
        commande({ id: 'o-2', status: ShopOrderStatus.PAID }),
        commande({ id: 'o-3', status: ShopOrderStatus.CANCELLED }),
        commande({ id: 'o-4', clubId: 'club-2' }),
      ],
      lines: [
        ligne({ id: 'l-1', orderId: 'o-1', awaitingStockQty: 2 }),
        ligne({ id: 'l-2', orderId: 'o-2', awaitingStockQty: 1 }),
        ligne({ id: 'l-3', orderId: 'o-3', awaitingStockQty: 5 }),
        ligne({ id: 'l-4', orderId: 'o-4', awaitingStockQty: 7 }),
        ligne({ id: 'l-5', orderId: 'o-1', variantId: 'v-2', awaitingStockQty: 4 }),
        ligne({ id: 'l-6', orderId: 'o-2', variantId: 'v-3', awaitingStockQty: 0 }),
      ],
      variants: [],
    });

    const parDeclinaison = await h.svc.preorderedByVariant(CLUB, ['v-1', 'v-3']);

    expect([...parDeclinaison]).toEqual([['v-1', 3]]);
  });

  it('sans déclinaison à compter, n’interroge pas la base', async () => {
    const h = makeStore({ orders: [], lines: [], variants: [] });

    await expect(h.svc.preorderedByVariant(CLUB, [])).resolves.toEqual(new Map());
    expect(h.db.shopOrderLine.findMany).not.toHaveBeenCalled();
  });
});

describe('ShopPreorderService.resumeTrackingInTx — reprise du suivi du stock', () => {
  const reprise = (h: ReturnType<typeof makeStore>, clubId = CLUB) =>
    h.db.$transaction((tx: unknown) =>
      h.svc.resumeTrackingInTx(tx as never, {
        clubId,
        variantId: 'v-1',
        reason: 'Reprise du suivi du stock',
      }),
    );

  it('vente passée avant le suivi : réservée sur le stock compté, son règlement ne laisse aucun article fantôme', async () => {
    // Le cas constaté en prod : taille créée sans suivi, vendue au comptoir,
    // stock compté ensuite dans la matrice, puis vente réglée.
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 1, awaitingStockQty: 0 })],
      variants: [declinaison({ trackStock: false, onHand: 0, available: 0 })],
    });

    await expect(reprise(h)).resolves.toBe(1);
    expect(attente(h, 'l-1')).toBe(1);

    // L'admin compte 4 : l'attribution sert la vente avant tout nouvel acheteur.
    await h.stock.adjust({
      clubId: CLUB,
      variantId: 'v-1',
      countedOnHand: 4,
      reason: 'Saisie depuis la matrice des déclinaisons',
    });
    await h.svc.allocate(CLUB, 'v-1');
    expect(h.variants[0]).toMatchObject({ onHand: 4, available: 3 });
    expect(attente(h, 'l-1')).toBe(0);

    // Le règlement sort ce que la ligne a réservé — sa quantité moins son
    // attente, comme `ShopService.claimFulfilmentInTx`.
    await h.db.$transaction((tx: unknown) =>
      h.stock.fulfill(tx as never, {
        clubId: CLUB,
        variantId: 'v-1',
        qty: 1 - attente(h, 'l-1'),
        orderId: 'o-1',
        orderLineId: 'l-1',
      }),
    );
    expect(h.variants[0]).toMatchObject({ onHand: 3, available: 3 });
  });

  it('une ancienne réservation ne compte plus : toute la commande est réservée de nouveau', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 2, awaitingStockQty: 0 })],
      variants: [declinaison({ trackStock: false, onHand: 5, available: 3 })],
    });

    await expect(reprise(h)).resolves.toBe(2);
    expect(h.variants[0]).toMatchObject({ trackStock: true, onHand: 5, available: 5 });

    await h.svc.allocate(CLUB, 'v-1');
    expect(h.variants[0].available).toBe(3);
    expect(attente(h, 'l-1')).toBe(0);
  });

  it('une précommande qui attendait déjà attend désormais toute sa quantité', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 3, awaitingStockQty: 2 })],
      variants: [declinaison({ trackStock: false })],
    });

    await expect(reprise(h)).resolves.toBe(3);
    expect(attente(h, 'l-1')).toBe(3);
  });

  it('ne remet en attente que les commandes en attente pas encore sorties, de ce club et de cette déclinaison', async () => {
    const h = makeStore({
      orders: [
        commande({ id: 'o-1' }),
        commande({ id: 'o-payee', status: ShopOrderStatus.PAID }),
        commande({ id: 'o-remise', fulfilledAt: new Date('2026-09-02T10:00:00Z') }),
        commande({ id: 'o-annulee', status: ShopOrderStatus.CANCELLED }),
        commande({ id: 'o-autre-club', clubId: 'club-2' }),
      ],
      lines: [
        ligne({ id: 'l-1', orderId: 'o-1', quantity: 1, awaitingStockQty: 0 }),
        ligne({ id: 'l-payee', orderId: 'o-payee', quantity: 1, awaitingStockQty: 0 }),
        ligne({ id: 'l-remise', orderId: 'o-remise', quantity: 1, awaitingStockQty: 0 }),
        ligne({ id: 'l-annulee', orderId: 'o-annulee', quantity: 1, awaitingStockQty: 0 }),
        ligne({ id: 'l-autre-club', orderId: 'o-autre-club', quantity: 1, awaitingStockQty: 0 }),
        ligne({ id: 'l-autre-decl', orderId: 'o-1', variantId: 'v-2', quantity: 1, awaitingStockQty: 0 }),
      ],
      variants: [declinaison({ trackStock: false })],
    });

    await expect(reprise(h)).resolves.toBe(1);

    expect(attente(h, 'l-1')).toBe(1);
    for (const id of ['l-payee', 'l-remise', 'l-annulee', 'l-autre-club', 'l-autre-decl']) {
      expect(attente(h, id)).toBe(0);
    }
  });

  it('verrouille les commandes AVANT la déclinaison — l’ordre du règlement', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 1, awaitingStockQty: 0 })],
      variants: [declinaison({ trackStock: false })],
    });

    await reprise(h);

    const verrou = h.db.shopOrder.updateMany.mock.invocationCallOrder[0];
    const reprend = h.db.shopProductVariant.updateMany.mock.invocationCallOrder[0];
    expect(verrou).toBeDefined();
    expect(reprend).toBeDefined();
    expect(verrou).toBeLessThan(reprend);
  });

  it('déclinaison déjà suivie : ne verrouille rien et ne touche à rien', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 1, awaitingStockQty: 0 })],
      variants: [declinaison({ onHand: 4, available: 4 })],
    });

    await expect(reprise(h)).resolves.toBeNull();

    expect(h.db.shopOrder.updateMany).not.toHaveBeenCalled();
    expect(attente(h, 'l-1')).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('déclinaison d’un AUTRE club : rien', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 1, awaitingStockQty: 0 })],
      variants: [declinaison({ trackStock: false })],
    });

    await expect(reprise(h, 'club-2')).resolves.toBeNull();

    expect(h.variants[0].trackStock).toBe(false);
    expect(attente(h, 'l-1')).toBe(0);
  });

  it('suivi repris par quelqu’un d’autre entre-temps : aucune commande remise en attente', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 1, awaitingStockQty: 0 })],
      variants: [declinaison({ trackStock: false })],
    });
    h.db.shopProductVariant.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(reprise(h)).resolves.toBeNull();

    expect(attente(h, 'l-1')).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('relit SOUS le verrou : une commande réglée juste avant n’est pas remise en attente', async () => {
    const h = makeStore({
      orders: [commande()],
      lines: [ligne({ quantity: 1, awaitingStockQty: 0 })],
      variants: [declinaison({ trackStock: false })],
    });
    const verrouiller = h.db.shopOrder.updateMany.getMockImplementation();
    h.db.shopOrder.updateMany.mockImplementationOnce(async (args: any) => {
      h.orders[0].status = ShopOrderStatus.PAID;
      return verrouiller(args);
    });

    await expect(reprise(h)).resolves.toBe(0);

    expect(attente(h, 'l-1')).toBe(0);
    expect(h.variants[0].trackStock).toBe(true);
  });

  it('les unités retirées de la commande (ADR-0020) n’attendent rien', async () => {
    // 3 commandés dont 1 annulé par le club, et une ligne entièrement échangée :
    // seules les unités encore dans la commande sont réservées de nouveau.
    const h = makeStore({
      orders: [commande()],
      lines: [
        ligne({ id: 'l-1', quantity: 3, cancelledQty: 1, awaitingStockQty: 0 }),
        ligne({ id: 'l-2', quantity: 1, cancelledQty: 1, awaitingStockQty: 0 }),
      ],
      variants: [declinaison({ trackStock: false })],
    });

    await expect(reprise(h)).resolves.toBe(2);

    expect(attente(h, 'l-1')).toBe(2);
    expect(attente(h, 'l-2')).toBe(0);
  });
});
