import { BadRequestException, Logger } from '@nestjs/common';
import { ShopStockMovementKind } from '@prisma/client';
import { ShopStockService } from './shop-stock.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Le moteur de stock — ADR-0012.
 *
 * Ces tests font APPLIQUER le prédicat par le double, ils n'inspectent pas la
 * forme du `where`. La distinction n'est pas cosmétique : un test qui vérifie
 * qu'un filtre contient `available: { gte: n }` reste vert même si le filtre
 * ne mord sur rien (cf. pitfalls/test-verifie-la-forme-pas-le-comportement.md).
 * Ici le double SIMULE PostgreSQL : il n'applique l'update que si la ligne
 * satisfait réellement toutes les conditions, et renvoie le `count` réel.
 */

type VariantRow = {
  id: string;
  clubId: string;
  active: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  reorderThreshold: number | null;
  lowStockAlertedAt: Date | null;
};

const VARIANT = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'v-1',
  clubId: 'club-1',
  active: true,
  trackStock: true,
  onHand: 5,
  available: 5,
  reorderThreshold: null,
  lowStockAlertedAt: null,
  ...over,
});

/**
 * Double de PostgreSQL : `updateMany` n'écrit que sur les lignes qui
 * satisfont TOUTES les conditions, et renvoie le nombre de lignes touchées.
 * C'est ce qui fait mordre les tests.
 */
function makeHarness(rows: VariantRow[]) {
  const movements: Array<Record<string, unknown>> = [];

  const matches = (r: VariantRow, where: Record<string, any>): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.active !== undefined && r.active !== where.active) return false;
    if (where.trackStock !== undefined && r.trackStock !== where.trackStock) {
      return false;
    }
    if (where.available?.gte !== undefined && !(r.available >= where.available.gte)) {
      return false;
    }
    if (where.onHand?.gte !== undefined && !(r.onHand >= where.onHand.gte)) {
      return false;
    }
    if (
      where.lowStockAlertedAt === null &&
      r.lowStockAlertedAt !== null
    ) {
      return false;
    }
    return true;
  };

  const applyData = (r: VariantRow, data: Record<string, any>) => {
    if (data.available?.decrement) r.available -= data.available.decrement;
    if (data.available?.increment) r.available += data.available.increment;
    if (data.onHand?.decrement) r.onHand -= data.onHand.decrement;
    if (data.onHand?.increment) r.onHand += data.onHand.increment;
    if (typeof data.available === 'number') r.available = data.available;
    if (typeof data.onHand === 'number') r.onHand = data.onHand;
    if (data.trackStock !== undefined) r.trackStock = data.trackStock;
    if ('lowStockAlertedAt' in data) r.lowStockAlertedAt = data.lowStockAlertedAt;
  };

  const variantApi = {
    updateMany: jest.fn(
      async ({ where, data }: { where: any; data: any }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => applyData(r, data));
        return { count: hit.length };
      },
    ),
    update: jest.fn(async ({ where, data }: { where: any; data: any }) => {
      const r = rows.find((x) => x.id === where.id);
      if (!r) throw new Error('not found');
      applyData(r, data);
      return r;
    }),
    findFirst: jest.fn(async ({ where }: { where: any }) => {
      return rows.find((r) => matches(r, where)) ?? null;
    }),
  };

  const tx = {
    shopProductVariant: variantApi,
    shopStockMovement: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        movements.push(data);
        return data;
      }),
    },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const svc = new ShopStockService(prisma as unknown as PrismaService);
  return { svc, tx, rows, movements };
}

const ORDER = { orderId: 'o-1', orderLineId: 'ol-1' };

describe('ShopStockService.reserve', () => {
  it('décrémente `available` et laisse `onHand` intact', async () => {
    // Le t-shirt n'est plus vendable, mais il est encore dans le placard.
    // Confondre les deux ferait mentir tout inventaire physique.
    const h = makeHarness([VARIANT({ onHand: 5, available: 5 })]);

    await h.svc.reserve(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 2,
      ...ORDER,
    });

    expect(h.rows[0].available).toBe(3);
    expect(h.rows[0].onHand).toBe(5);
  });

  it('REFUSE de descendre sous zéro — la garantie anti-survente', async () => {
    const h = makeHarness([VARIANT({ available: 1 })]);

    await expect(
      h.svc.reserve(h.tx as never, {
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 2,
        ...ORDER,
      }),
    ).rejects.toThrow(BadRequestException);

    // L'assertion qui mord : le stock n'a pas bougé.
    expect(h.rows[0].available).toBe(1);
  });

  it('deux réservations concurrentes sur le DERNIER article : une seule passe', async () => {
    // Le cœur du lot. Le double applique réellement le prédicat, donc la
    // seconde réservation voit available = 0 et échoue — exactement ce que
    // fait PostgreSQL en READ COMMITTED après avoir relâché le verrou.
    const h = makeHarness([VARIANT({ available: 1 })]);

    const first = await h.svc
      .reserve(h.tx as never, {
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 1,
        ...ORDER,
      })
      .then(() => 'ok' as const)
      .catch(() => 'ko' as const);

    const second = await h.svc
      .reserve(h.tx as never, {
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 1,
        orderId: 'o-2',
        orderLineId: 'ol-2',
      })
      .then(() => 'ok' as const)
      .catch(() => 'ko' as const);

    expect([first, second]).toEqual(['ok', 'ko']);
    expect(h.rows[0].available).toBe(0);
  });

  it('refuse de servir une variante d’un AUTRE club', async () => {
    // La frontière multi-tenant est dans l'écriture, pas dans une lecture
    // préalable : c'est la même requête qui tient les deux garanties.
    const h = makeHarness([VARIANT({ clubId: 'club-2', available: 10 })]);

    await expect(
      h.svc.reserve(h.tx as never, {
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 1,
        ...ORDER,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(h.rows[0].available).toBe(10);
  });

  it('refuse une variante désactivée', async () => {
    const h = makeHarness([VARIANT({ active: false })]);

    await expect(
      h.svc.reserve(h.tx as never, {
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 1,
        ...ORDER,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('laisse passer une variante NON SUIVIE, sans écrire de mouvement', async () => {
    // Stock illimité : il n'y a rien à décompter, donc rien à archiver.
    const h = makeHarness([VARIANT({ trackStock: false, available: 0 })]);

    await h.svc.reserve(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 99,
      ...ORDER,
    });

    expect(h.rows[0].available).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('archive le mouvement dans la même transaction que le décrément', async () => {
    const h = makeHarness([VARIANT({ available: 5 })]);

    await h.svc.reserve(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 2,
      ...ORDER,
    });

    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.RESERVE,
        availableDelta: -2,
        onHandDelta: 0,
        orderId: 'o-1',
        orderLineId: 'ol-1',
      }),
    ]);
  });
});

describe('ShopStockService.fulfill', () => {
  it('décrémente `onHand` SANS retoucher `available`', async () => {
    // `available` avait déjà baissé à la réservation. Le décompter ici
    // vendrait deux fois la même unité.
    const h = makeHarness([VARIANT({ onHand: 5, available: 3 })]);

    await h.svc.fulfill(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 2,
      ...ORDER,
    });

    expect(h.rows[0].onHand).toBe(3);
    expect(h.rows[0].available).toBe(3);
  });
});

describe('ShopStockService.release', () => {
  it('rend les unités réservées et RÉARME l’alerte de seuil', async () => {
    // Sans la remise à null, la première alerte masquerait toutes les
    // suivantes : le stock remonterait, redescendrait, et plus personne ne
    // serait prévenu.
    const h = makeHarness([
      VARIANT({ available: 0, lowStockAlertedAt: new Date('2026-07-01') }),
    ]);

    await h.svc.release(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 2,
      ...ORDER,
    });

    expect(h.rows[0].available).toBe(2);
    expect(h.rows[0].lowStockAlertedAt).toBeNull();
  });
});

describe('ShopStockService.recordShrinkage', () => {
  it('refuse de déclarer plus de pertes qu’il n’y a de marchandise', async () => {
    const h = makeHarness([VARIANT({ onHand: 2, available: 2 })]);

    await expect(
      h.svc.recordShrinkage({
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 5,
        reason: 'Carton noyé',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(h.rows[0].onHand).toBe(2);
  });

  it('descend les deux compteurs ensemble', async () => {
    const h = makeHarness([VARIANT({ onHand: 5, available: 5 })]);

    await h.svc.recordShrinkage({
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 2,
      reason: 'Casse',
    });

    expect(h.rows[0].onHand).toBe(3);
    expect(h.rows[0].available).toBe(3);
  });
});

describe('ShopStockService.adjust', () => {
  it('aligne `onHand` sur le comptage et reporte l’écart sur `available`', async () => {
    // Comptage physique : 3 alors que la base croyait 5, dont 1 réservé.
    // L'écart de −2 se reporte sur le vendable : 4 → 2.
    const h = makeHarness([VARIANT({ onHand: 5, available: 4 })]);

    await h.svc.adjust({
      clubId: 'club-1',
      variantId: 'v-1',
      countedOnHand: 3,
      reason: 'Inventaire',
    });

    expect(h.rows[0].onHand).toBe(3);
    expect(h.rows[0].available).toBe(2);
  });

  it('ne fait jamais descendre `available` sous zéro', async () => {
    // Le manque est réel, mais on ne peut pas « dé-réserver » une commande
    // déjà passée : le vendable plancher à 0.
    const h = makeHarness([VARIANT({ onHand: 5, available: 1 })]);

    await h.svc.adjust({
      clubId: 'club-1',
      variantId: 'v-1',
      countedOnHand: 0,
      reason: 'Vol',
    });

    expect(h.rows[0].onHand).toBe(0);
    expect(h.rows[0].available).toBe(0);
  });
});

describe('ShopStockService.reserveUpTo — précommande (ADR-0018)', () => {
  const reserveUpTo = (h: ReturnType<typeof makeHarness>, qty: number) =>
    h.svc.reserveUpTo(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty,
      ...ORDER,
    });

  it('réserve tout quand le stock suffit', async () => {
    const h = makeHarness([VARIANT({ onHand: 5, available: 5 })]);

    await expect(reserveUpTo(h, 3)).resolves.toBe(3);

    expect(h.rows[0].available).toBe(2);
    expect(h.rows[0].onHand).toBe(5);
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.RESERVE,
        onHandDelta: 0,
        availableDelta: -3,
        ...ORDER,
      }),
    ]);
  });

  it('réserve CE QUI RESTE et le dit, sans jamais descendre sous zéro', async () => {
    const h = makeHarness([VARIANT({ onHand: 2, available: 2 })]);

    await expect(reserveUpTo(h, 5)).resolves.toBe(2);

    expect(h.rows[0].available).toBe(0);
    expect(h.movements).toEqual([
      expect.objectContaining({ availableDelta: -2 }),
    ]);
  });

  it('épuisé : ne réserve rien et n’archive rien', async () => {
    const h = makeHarness([VARIANT({ onHand: 0, available: 0 })]);

    await expect(reserveUpTo(h, 2)).resolves.toBe(0);

    expect(h.rows[0].available).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('course perdue : relit, et ne prend que ce qui reste vraiment', async () => {
    // Entre la lecture et l'écriture, une vente concurrente a pris 3 des 4
    // unités lues. L'écriture conditionnelle refuse d'en prendre 3 ; on relit
    // et l'on ne prend que la dernière.
    const h = makeHarness([VARIANT({ available: 1 })]);
    h.tx.shopProductVariant.findFirst.mockImplementationOnce(async () => ({
      ...h.rows[0],
      available: 4,
    }));

    await expect(reserveUpTo(h, 3)).resolves.toBe(1);

    expect(h.rows[0].available).toBe(0);
    expect(h.movements).toEqual([
      expect.objectContaining({ availableDelta: -1 }),
    ]);
  });

  it('abandonne après trois courses perdues : tout attend l’arrivage, rien n’est pris', async () => {
    const h = makeHarness([VARIANT({ available: 1 })]);
    h.tx.shopProductVariant.findFirst.mockImplementation(async () => ({
      ...h.rows[0],
      available: 10,
    }));
    const journal = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      await expect(reserveUpTo(h, 5)).resolves.toBe(0);
    } finally {
      journal.mockRestore();
    }

    expect(h.tx.shopProductVariant.findFirst).toHaveBeenCalledTimes(3);
    expect(h.rows[0].available).toBe(1);
    expect(h.movements).toHaveLength(0);
  });

  it('stock non suivi : tout est servi, rien n’est décompté ni archivé', async () => {
    const h = makeHarness([
      VARIANT({ trackStock: false, onHand: 0, available: 0 }),
    ]);

    await expect(reserveUpTo(h, 4)).resolves.toBe(4);

    expect(h.rows[0].available).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('refuse la déclinaison d’un AUTRE club, sans rien écrire', async () => {
    const h = makeHarness([VARIANT({ clubId: 'club-2', available: 10 })]);

    await expect(reserveUpTo(h, 2)).rejects.toThrow(BadRequestException);

    expect(h.rows[0].available).toBe(10);
    expect(h.movements).toHaveLength(0);
  });

  it('sert une déclinaison retirée de la vente : une précommande acceptée doit pouvoir l’être', async () => {
    const h = makeHarness([VARIANT({ active: false, available: 3 })]);

    await expect(reserveUpTo(h, 2)).resolves.toBe(2);

    expect(h.rows[0].available).toBe(1);
  });
});

describe('ShopStockService.returnToStock — retour client (ADR-0019)', () => {
  const retour = (h: ReturnType<typeof makeHarness>, qty = 2) =>
    h.svc.returnToStock(h.tx as never, {
      clubId: 'club-1',
      variantId: 'v-1',
      qty,
      ...ORDER,
      userId: 'u-1',
      reason: 'Retour client : mauvaise taille',
    });

  it('remonte les deux compteurs, réarme l’alerte et archive le retour', async () => {
    // L'article est de nouveau dans le placard ET vendable.
    const h = makeHarness([
      VARIANT({ onHand: 3, available: 1, lowStockAlertedAt: new Date('2026-09-01') }),
    ]);

    await expect(retour(h)).resolves.toBe(true);

    expect(h.rows[0].onHand).toBe(5);
    expect(h.rows[0].available).toBe(3);
    expect(h.rows[0].lowStockAlertedAt).toBeNull();
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.RETURN,
        onHandDelta: 2,
        availableDelta: 2,
        orderId: 'o-1',
        orderLineId: 'ol-1',
        userId: 'u-1',
        reason: 'Retour client : mauvaise taille',
      }),
    ]);
  });

  it('déclinaison non suivie : rien à remonter ni à archiver', async () => {
    const h = makeHarness([VARIANT({ trackStock: false, onHand: 0, available: 0 })]);

    await expect(retour(h)).resolves.toBe(false);

    expect(h.rows[0].onHand).toBe(0);
    expect(h.movements).toHaveLength(0);
  });

  it('ne touche pas la déclinaison d’un AUTRE club', async () => {
    const h = makeHarness([VARIANT({ clubId: 'club-2', onHand: 3, available: 3 })]);

    await expect(retour(h)).resolves.toBe(false);

    expect(h.rows[0].onHand).toBe(3);
    expect(h.movements).toHaveLength(0);
  });

  it('refuse une quantité nulle, sans rien écrire', async () => {
    const h = makeHarness([VARIANT()]);

    await expect(retour(h, 0)).rejects.toThrow(BadRequestException);

    expect(h.tx.shopProductVariant.updateMany).not.toHaveBeenCalled();
  });
});

describe('ShopStockService.recordShrinkage — transaction de l’appelant', () => {
  const prismaOf = (h: ReturnType<typeof makeHarness>) =>
    (h.svc as unknown as { prisma: { $transaction: jest.Mock } }).prisma;

  it('écrit dans la transaction fournie, sans en ouvrir une autre, et rattache la commande', async () => {
    // L'article rendu puis déclaré perdu : le retour et la perte vivent ou
    // meurent avec l'annulation qui les justifie.
    const h = makeHarness([VARIANT({ onHand: 5, available: 5 })]);

    await h.svc.recordShrinkage(
      {
        clubId: 'club-1',
        variantId: 'v-1',
        qty: 2,
        reason: 'Article rendu déclaré perdu : taché',
        ...ORDER,
      },
      h.tx as never,
    );

    expect(prismaOf(h).$transaction).not.toHaveBeenCalled();
    expect(h.rows[0].onHand).toBe(3);
    expect(h.rows[0].available).toBe(3);
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.SHRINKAGE,
        onHandDelta: -2,
        availableDelta: -2,
        orderId: 'o-1',
        orderLineId: 'ol-1',
      }),
    ]);
  });

  it('sans transaction fournie, ouvre la sienne comme avant', async () => {
    const h = makeHarness([VARIANT({ onHand: 5, available: 5 })]);

    await h.svc.recordShrinkage({
      clubId: 'club-1',
      variantId: 'v-1',
      qty: 1,
      reason: 'Casse',
    });

    expect(prismaOf(h).$transaction).toHaveBeenCalledTimes(1);
    expect(h.movements).toEqual([
      expect.objectContaining({ orderId: null, orderLineId: null }),
    ]);
  });
});
