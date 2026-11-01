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
  /** Pack (ADR-0024) : vendu, jamais stocké. */
  isBundle: boolean;
  onHand: number;
  available: number;
  reorderThreshold: number | null;
  lowStockAlertedAt: Date | null;
};

/** Une pièce de pack au catalogue (`ShopBundleComponent`). */
type BundleRow = {
  clubId: string;
  bundleVariantId: string;
  componentVariantId: string;
  quantity: number;
};

/** Une pièce figée sur une ligne de commande (`ShopOrderLineComponent`). */
type LinePartRow = {
  clubId: string;
  orderLineId: string;
  variantId: string;
  unitQty: number;
};

const VARIANT = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'v-1',
  clubId: 'club-1',
  active: true,
  trackStock: true,
  isBundle: false,
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
function makeHarness(rows: VariantRow[], bundles: BundleRow[] = []) {
  const movements: Array<Record<string, unknown>> = [];
  const lineParts: LinePartRow[] = [];

  const matches = (r: VariantRow, where: Record<string, any>): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.active !== undefined && r.active !== where.active) return false;
    if (where.trackStock !== undefined && r.trackStock !== where.trackStock) {
      return false;
    }
    if (where.isBundle !== undefined && r.isBundle !== where.isBundle) {
      return false;
    }
    if (where.available?.gte !== undefined && !(r.available >= where.available.gte)) {
      return false;
    }
    if (where.onHand?.gte !== undefined && !(r.onHand >= where.onHand.gte)) {
      return false;
    }
    // Égalité stricte : la reprise du suivi n'écrit que sur l'état qu'elle a lu.
    if (typeof where.onHand === 'number' && r.onHand !== where.onHand) return false;
    if (typeof where.available === 'number' && r.available !== where.available) {
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
    // Une COPIE, comme Prisma : une lecture ne suit pas les écritures qui
    // la suivent.
    findFirst: jest.fn(
      async ({
        where,
      }: {
        where: any;
      }): Promise<
        | (VariantRow & {
            bundleComponents?: Array<{ componentVariantId: string; quantity: number }>;
          })
        | null
      > => {
      const hit = rows.find((r) => matches(r, where));
      if (!hit) return null;
      return {
        ...hit,
        bundleComponents: bundles
          .filter((b) => b.bundleVariantId === hit.id && b.clubId === hit.clubId)
          .map((b) => ({
            componentVariantId: b.componentVariantId,
            quantity: b.quantity,
          })),
      };
    },
    ),
  };

  const tx = {
    shopProductVariant: variantApi,
    shopStockMovement: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        movements.push(data);
        return data;
      }),
    },
    shopBundleComponent: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        bundles.filter(
          (b) =>
            b.clubId === where.clubId &&
            where.bundleVariantId.in.includes(b.bundleVariantId),
        ),
      ),
    },
    shopOrderLineComponent: {
      createMany: jest.fn(async ({ data }: { data: LinePartRow[] }) => {
        for (const d of data) {
          if (
            lineParts.some(
              (l) => l.orderLineId === d.orderLineId && l.variantId === d.variantId,
            )
          ) {
            throw new Error('P2002 orderLineId_variantId');
          }
        }
        lineParts.push(...data);
        return { count: data.length };
      }),
      findMany: jest.fn(async ({ where }: { where: any }) =>
        lineParts
          .filter(
            (l) => l.clubId === where.clubId && l.orderLineId === where.orderLineId,
          )
          .sort((a, b) => (a.variantId < b.variantId ? -1 : 1))
          .map((l) => ({ variantId: l.variantId, unitQty: l.unitQty })),
      ),
    },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const svc = new ShopStockService(prisma as unknown as PrismaService);
  return { svc, tx, rows, movements, lineParts };
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

describe('ShopStockService.resumeTracking — reprise du suivi', () => {
  const reprise = (h: ReturnType<typeof makeHarness>, clubId = 'club-1') =>
    h.svc.resumeTracking(h.tx as never, {
      clubId,
      variantId: 'v-1',
      userId: 'u-1',
      reason: 'Reprise du suivi du stock',
    });

  it('efface l’écart qui ne désigne plus aucune réservation, et l’archive', async () => {
    // Pendant la période non suivie, ni les annulations ni les règlements
    // n'ont touché aux compteurs : les 3 « réservés » ne veulent plus rien dire.
    const h = makeHarness([
      VARIANT({
        trackStock: false,
        onHand: 5,
        available: 2,
        lowStockAlertedAt: new Date('2026-09-01'),
      }),
    ]);

    await expect(reprise(h)).resolves.toBe(true);

    expect(h.rows[0]).toMatchObject({
      trackStock: true,
      onHand: 5,
      available: 5,
      lowStockAlertedAt: null,
    });
    expect(h.movements).toEqual([
      expect.objectContaining({
        kind: ShopStockMovementKind.ADJUSTMENT,
        onHandDelta: 0,
        availableDelta: 3,
        reason: 'Reprise du suivi du stock',
        userId: 'u-1',
      }),
    ]);
  });

  it('jamais suivie : compteurs à zéro, la reprise est archivée quand même', async () => {
    const h = makeHarness([VARIANT({ trackStock: false, onHand: 0, available: 0 })]);

    await expect(reprise(h)).resolves.toBe(true);

    expect(h.rows[0]).toMatchObject({ trackStock: true, onHand: 0, available: 0 });
    expect(h.movements).toEqual([
      expect.objectContaining({ onHandDelta: 0, availableDelta: 0 }),
    ]);
  });

  it('déjà suivie : ne touche à rien', async () => {
    const h = makeHarness([VARIANT({ onHand: 5, available: 2 })]);

    await expect(reprise(h)).resolves.toBe(false);

    expect(h.rows[0]).toMatchObject({ onHand: 5, available: 2 });
    expect(h.tx.shopProductVariant.updateMany).not.toHaveBeenCalled();
    expect(h.movements).toHaveLength(0);
  });

  it('ne reprend pas la déclinaison d’un AUTRE club', async () => {
    const h = makeHarness([VARIANT({ trackStock: false, onHand: 5, available: 2 })]);

    await expect(reprise(h, 'club-2')).resolves.toBe(false);

    expect(h.rows[0]).toMatchObject({ trackStock: false, available: 2 });
    expect(h.movements).toHaveLength(0);
  });

  it('compteurs changés entre la lecture et l’écriture : ne reprend rien', async () => {
    const h = makeHarness([VARIANT({ trackStock: false, onHand: 5, available: 2 })]);
    h.tx.shopProductVariant.findFirst.mockImplementationOnce(async () => ({
      ...h.rows[0],
      onHand: 7,
    }));

    await expect(reprise(h)).resolves.toBe(false);

    expect(h.rows[0]).toMatchObject({ trackStock: false, onHand: 5, available: 2 });
    expect(h.movements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Packs composés (ADR-0024)
// ---------------------------------------------------------------------------

/**
 * Un pack complet : 1 paire de gants rouges + 1 paire de gants bleus. Le pack
 * lui-même n'a aucun stock, et `trackStock: false` — c'est ce qui le ferait
 * passer pour un article illimité si le moteur l'oubliait.
 */
function packHarness(over: { rouge?: number; bleu?: number } = {}) {
  const PACK = VARIANT({
    id: 'v-pack',
    trackStock: false,
    isBundle: true,
    onHand: 0,
    available: 0,
  });
  const ROUGE = VARIANT({ id: 'v-gants-rouge', onHand: over.rouge ?? 5, available: over.rouge ?? 5 });
  const BLEU = VARIANT({ id: 'v-gants-bleu', onHand: over.bleu ?? 5, available: over.bleu ?? 5 });
  const bundles = [
    { clubId: 'club-1', bundleVariantId: 'v-pack', componentVariantId: 'v-gants-rouge', quantity: 1 },
    { clubId: 'club-1', bundleVariantId: 'v-pack', componentVariantId: 'v-gants-bleu', quantity: 2 },
  ];
  const h = makeHarness([PACK, ROUGE, BLEU], bundles);
  const row = (id: string) => h.rows.find((r) => r.id === id)!;
  return { ...h, bundles, row };
}

const PACK_LINE = {
  clubId: 'club-1',
  variantId: 'v-pack',
  orderId: 'o-1',
  orderLineId: 'ol-pack',
};

describe('ShopStockService — packs composés (ADR-0024)', () => {
  it('réserver un pack réserve ses pièces, multipliées par leur quantité, et fige la composition sur la ligne', async () => {
    const h = packHarness();

    await h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 2 });

    expect(h.row('v-gants-rouge').available).toBe(3); // 2 packs × 1
    expect(h.row('v-gants-bleu').available).toBe(1); // 2 packs × 2
    expect(h.row('v-pack')).toMatchObject({ onHand: 0, available: 0 });
    expect(h.lineParts).toEqual([
      { clubId: 'club-1', orderLineId: 'ol-pack', variantId: 'v-gants-bleu', unitQty: 2 },
      { clubId: 'club-1', orderLineId: 'ol-pack', variantId: 'v-gants-rouge', unitQty: 1 },
    ]);
    // Le journal porte les pièces, rattachées à la ligne du pack.
    expect(h.movements).toEqual([
      expect.objectContaining({ variantId: 'v-gants-bleu', kind: ShopStockMovementKind.RESERVE, availableDelta: -4, orderLineId: 'ol-pack' }),
      expect.objectContaining({ variantId: 'v-gants-rouge', kind: ShopStockMovementKind.RESERVE, availableDelta: -2, orderLineId: 'ol-pack' }),
    ]);
  });

  it('REFUSE le pack dès qu’une pièce manque — un pack n’est jamais vendu amputé', async () => {
    const h = packHarness({ bleu: 3 });

    await expect(
      h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 2 }),
    ).rejects.toThrow('une de ses pièces manque');
  });

  it('un pack n’est JAMAIS un stock illimité, même sans pièce', async () => {
    const h = packHarness();
    h.bundles.length = 0;

    await expect(
      h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 1 }),
    ).rejects.toThrow(BadRequestException);
    expect(h.movements).toHaveLength(0);
  });

  it('un pack retiré de la vente ne se réserve pas', async () => {
    const h = packHarness();
    h.row('v-pack').active = false;

    await expect(
      h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 1 }),
    ).rejects.toThrow(BadRequestException);
    expect(h.row('v-gants-rouge').available).toBe(5);
  });

  it('libère les pièces FIGÉES, même si le catalogue a changé depuis', async () => {
    const h = packHarness();
    await h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 1 });

    // Le club remplace les gants bleus par des rouges dans le pack.
    h.bundles.splice(0, h.bundles.length, {
      clubId: 'club-1',
      bundleVariantId: 'v-pack',
      componentVariantId: 'v-gants-rouge',
      quantity: 3,
    });
    await h.svc.release(h.tx as never, { ...PACK_LINE, qty: 1 });

    expect(h.row('v-gants-rouge').available).toBe(5);
    expect(h.row('v-gants-bleu').available).toBe(5);
  });

  it('la sortie au paiement fait quitter le placard aux pièces', async () => {
    const h = packHarness();
    await h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 1 });

    await h.svc.fulfill(h.tx as never, { ...PACK_LINE, qty: 1 });

    expect(h.row('v-gants-rouge')).toMatchObject({ onHand: 4, available: 4 });
    expect(h.row('v-gants-bleu')).toMatchObject({ onHand: 3, available: 3 });
    expect(h.row('v-pack')).toMatchObject({ onHand: 0, available: 0 });
  });

  it('un pack rendu remonte ses pièces ; déclaré perdu, elles redescendent', async () => {
    const h = packHarness();
    await h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 1 });
    await h.svc.fulfill(h.tx as never, { ...PACK_LINE, qty: 1 });

    const tracked = await h.svc.returnToStock(h.tx as never, { ...PACK_LINE, qty: 1 });
    expect(tracked).toBe(true);
    expect(h.row('v-gants-rouge')).toMatchObject({ onHand: 5, available: 5 });
    expect(h.row('v-gants-bleu')).toMatchObject({ onHand: 5, available: 5 });

    await h.svc.recordShrinkage(
      { ...PACK_LINE, qty: 1, reason: 'Abîmé' },
      h.tx as never,
    );
    expect(h.row('v-gants-rouge')).toMatchObject({ onHand: 4, available: 4 });
    expect(h.row('v-gants-bleu')).toMatchObject({ onHand: 3, available: 3 });
  });

  it('une perte sur un pack SANS ligne est refusée : rien ne dit quelles pièces sortir', async () => {
    const h = packHarness();

    await expect(
      h.svc.recordShrinkage({ clubId: 'club-1', variantId: 'v-pack', qty: 1, reason: 'Casse' }),
    ).rejects.toThrow(BadRequestException);
    expect(h.row('v-gants-rouge').onHand).toBe(5);
  });

  it('un pack ne se précommande pas : `reserveUpTo` le refuse au lieu de le servir en illimité', async () => {
    const h = packHarness();

    await expect(
      h.svc.reserveUpTo(h.tx as never, { ...PACK_LINE, qty: 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('une déclinaison non suivie ordinaire reste illimitée', async () => {
    const h = makeHarness([VARIANT({ trackStock: false, available: 0 })]);

    await h.svc.reserve(h.tx as never, { clubId: 'club-1', variantId: 'v-1', qty: 3, ...ORDER });

    expect(h.movements).toHaveLength(0);
  });

  it('verrouille pièces et articles seuls dans UN ordre croissant, pack déplié', async () => {
    const h = packHarness();

    await h.svc.lockForOrder(h.tx as never, 'club-1', ['v-pack', 'v-gants-rouge']);

    const locked = h.tx.shopProductVariant.updateMany.mock.calls.map(
      ([arg]) => (arg as { where: { id: string } }).where.id,
    );
    expect(locked).toEqual(['v-gants-bleu', 'v-gants-rouge']);
  });

  it('dit quelles déclinaisons stockées une ligne fait bouger', async () => {
    const h = packHarness();
    await h.svc.reserve(h.tx as never, { ...PACK_LINE, qty: 1 });

    await expect(
      h.svc.stockedVariantIdsOfLine(h.tx as never, 'club-1', { id: 'ol-pack', variantId: 'v-pack' }),
    ).resolves.toEqual(['v-gants-bleu', 'v-gants-rouge']);
    await expect(
      h.svc.stockedVariantIdsOfLine(h.tx as never, 'club-1', { id: 'ol-autre', variantId: 'v-1' }),
    ).resolves.toEqual(['v-1']);
  });
});
