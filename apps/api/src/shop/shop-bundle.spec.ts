import { BadRequestException } from '@nestjs/common';
import { ShopVariantsService } from './shop-variants.service';
import { bundleCounters, stockOf } from './bundle-stock';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopService } from './shop.service';
import type { ShopStockService } from './shop-stock.service';

/**
 * Packs composés (ADR-0024) : composition au catalogue et stock dérivé.
 *
 * Le moteur de stock, lui, se teste dans shop-stock.service.spec.ts. Ici, ce
 * sont les RÈGLES qui le protègent : sans elles, un pack illimité, un pack
 * dans un pack ou un stock propre qui disparaît sans mouvement redeviennent
 * possibles.
 *
 * Le double applique les clauses du `where` qu'il reçoit et REFUSE celles
 * qu'il ne connaît pas : un service qui oublierait `isBundle: false` dans la
 * conversion ne serait pas sauvé par un double qui filtrerait de lui-même.
 */

const CLUB = 'club-1';

type VariantRow = {
  id: string;
  clubId: string;
  productId: string;
  label: string | null;
  isBundle: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  reorderThreshold: number | null;
  reorderTargetQty: number | null;
  lowStockAlertedAt: Date | null;
};

type BundleRow = {
  clubId: string;
  bundleVariantId: string;
  componentVariantId: string;
  quantity: number;
};

const VARIANT = (over: Partial<VariantRow> & { id: string; productId: string }): VariantRow => ({
  clubId: CLUB,
  label: null,
  isBundle: false,
  trackStock: true,
  onHand: 0,
  available: 0,
  reorderThreshold: null,
  reorderTargetQty: null,
  lowStockAlertedAt: null,
  ...over,
});

function known(where: Record<string, unknown>, keys: string[]) {
  for (const k of Object.keys(where)) {
    if (!keys.includes(k)) throw new Error(`Clause non simulée par le double : ${k}`);
  }
}

function makeHarness(opts: {
  variants: VariantRow[];
  bundles?: BundleRow[];
  preorderEnabled?: Record<string, boolean>;
  awaiting?: number;
}) {
  const variants = opts.variants;
  const bundles = opts.bundles ?? [];
  const products: Record<string, { name: string; preorderEnabled: boolean }> = {};
  for (const v of variants) {
    products[v.productId] = {
      name: v.productId,
      preorderEnabled: opts.preorderEnabled?.[v.productId] ?? false,
    };
  }

  const matches = (r: VariantRow, where: any): boolean => {
    known(where, ['id', 'clubId', 'isBundle', 'OR']);
    if (where.id !== undefined) {
      if (typeof where.id === 'object') {
        known(where.id, ['in']);
        if (!where.id.in.includes(r.id)) return false;
      } else if (r.id !== where.id) return false;
    }
    if (where.clubId !== undefined && r.clubId !== where.clubId) return false;
    if (where.isBundle !== undefined && r.isBundle !== where.isBundle) return false;
    if (where.OR !== undefined) {
      const any = (where.OR as any[]).some((c) => {
        known(c, ['trackStock', 'onHand', 'available']);
        return Object.entries(c).every(([k, v]) => (r as any)[k] === v);
      });
      if (!any) return false;
    }
    return true;
  };
  const shape = (r: VariantRow) => ({
    ...r,
    product: products[r.productId],
  });

  const prisma: any = {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    shopProductVariant: {
      findFirst: jest.fn(async ({ where }: any) => {
        const r = variants.find((x) => matches(x, where));
        return r ? shape(r) : null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        variants.filter((x) => matches(x, where)).map(shape),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((x) => matches(x, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    shopBundleComponent: {
      count: jest.fn(async ({ where }: any) => {
        known(where, ['clubId', 'componentVariantId']);
        return bundles.filter(
          (b) => b.clubId === where.clubId && b.componentVariantId === where.componentVariantId,
        ).length;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        known(where, ['clubId', 'bundleVariantId']);
        const gone = bundles.filter(
          (b) => b.clubId === where.clubId && b.bundleVariantId === where.bundleVariantId,
        );
        gone.forEach((b) => bundles.splice(bundles.indexOf(b), 1));
        return { count: gone.length };
      }),
      createMany: jest.fn(async ({ data }: { data: BundleRow[] }) => {
        bundles.push(...data);
        return { count: data.length };
      }),
    },
    shopOrderLine: {
      count: jest.fn(async () => opts.awaiting ?? 0),
    },
  };
  const shop = { reloadProduct: jest.fn(async () => ({ id: 'reloaded' })) };
  const svc = new ShopVariantsService(
    prisma as PrismaService,
    shop as unknown as ShopService,
    {} as ShopStockService,
    {} as never,
  );
  const row = (id: string) => variants.find((v) => v.id === id)!;
  return { svc, prisma, bundles, row };
}

/** Le kit kamikaze : gants et protège-pieds, chacun son article. */
const kit = (over: { packStock?: number; packTracked?: boolean } = {}) =>
  makeHarness({
    variants: [
      VARIANT({
        id: 'v-pack',
        productId: 'p-pack',
        onHand: over.packStock ?? 0,
        available: over.packStock ?? 0,
        trackStock: over.packTracked ?? true,
      }),
      VARIANT({ id: 'v-gants', productId: 'p-gants', label: 'Rouge', onHand: 4, available: 4 }),
      VARIANT({ id: 'v-pieds', productId: 'p-pieds', label: 'Rouge / M', onHand: 9, available: 9 }),
      VARIANT({ id: 'v-gants-2', productId: 'p-pack', label: 'Autre' }),
    ],
  });

describe('setBundleComponents — composer un pack (ADR-0024)', () => {
  it('fait de la déclinaison un pack : non stockée, compteurs à zéro, composition enregistrée', async () => {
    const h = kit();

    await h.svc.setBundleComponents(CLUB, 'v-pack', [
      { componentVariantId: 'v-gants', quantity: 1 },
      { componentVariantId: 'v-pieds', quantity: 1 },
    ]);

    expect(h.row('v-pack')).toMatchObject({
      isBundle: true,
      trackStock: false,
      onHand: 0,
      available: 0,
      reorderThreshold: null,
    });
    expect(h.bundles).toEqual([
      { clubId: CLUB, bundleVariantId: 'v-pack', componentVariantId: 'v-gants', quantity: 1 },
      { clubId: CLUB, bundleVariantId: 'v-pack', componentVariantId: 'v-pieds', quantity: 1 },
    ]);
  });

  it('REFUSE une déclinaison qui a encore du stock propre : il disparaîtrait sans mouvement', async () => {
    const h = kit({ packStock: 3 });

    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 1 }]),
    ).rejects.toThrow('encore du stock');
    expect(h.row('v-pack')).toMatchObject({ isBundle: false, onHand: 3 });
    expect(h.bundles).toHaveLength(0);
  });

  it('accepte une déclinaison non suivie, quels que soient ses compteurs', async () => {
    const h = kit({ packStock: 7, packTracked: false });

    await h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 2 }]);

    expect(h.row('v-pack')).toMatchObject({ isBundle: true, onHand: 0, available: 0 });
  });

  it('remplace la composition sans retoucher les compteurs d’un pack existant', async () => {
    const h = kit();
    await h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 1 }]);

    await h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-pieds', quantity: 2 }]);

    expect(h.bundles).toEqual([
      { clubId: CLUB, bundleVariantId: 'v-pack', componentVariantId: 'v-pieds', quantity: 2 },
    ]);
    expect(h.row('v-pack').isBundle).toBe(true);
  });

  it('une liste vide dissout le pack : déclinaison STOCKÉE à zéro, jamais illimitée', async () => {
    const h = kit();
    await h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 1 }]);

    await h.svc.setBundleComponents(CLUB, 'v-pack', []);

    expect(h.row('v-pack')).toMatchObject({
      isBundle: false,
      trackStock: true,
      onHand: 0,
      available: 0,
    });
    expect(h.bundles).toHaveLength(0);
  });

  it('une liste vide sur une déclinaison ordinaire ne touche à rien', async () => {
    const h = kit({ packStock: 3 });

    await h.svc.setBundleComponents(CLUB, 'v-pack', []);

    expect(h.row('v-pack')).toMatchObject({ isBundle: false, trackStock: true, onHand: 3 });
    expect(h.prisma.shopProductVariant.updateMany).not.toHaveBeenCalled();
  });

  it('refuse une pièce du même article : une pièce est un autre article', async () => {
    const h = kit();

    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants-2', quantity: 1 }]),
    ).rejects.toThrow('déclinaison du pack lui-même');
  });

  it('refuse un pack dans un pack, dans les deux sens', async () => {
    const h = kit();
    await h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 1 }]);

    // Le pack comme pièce d'un autre.
    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pieds', [{ componentVariantId: 'v-pack', quantity: 1 }]),
    ).rejects.toThrow('est un pack');
    // Une pièce qui deviendrait elle-même un pack.
    await expect(
      h.svc.setBundleComponents(CLUB, 'v-gants', [{ componentVariantId: 'v-pieds', quantity: 1 }]),
    ).rejects.toThrow('pièce d’un autre pack');
  });

  it('refuse une pièce non suivie : elle rendrait le pack illimité sans le montrer', async () => {
    const h = kit();
    h.row('v-pieds').trackStock = false;

    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-pieds', quantity: 1 }]),
    ).rejects.toThrow('Suivez le stock');
  });

  it('refuse une pièce d’un autre club, sans la nommer', async () => {
    const h = kit();
    h.row('v-pieds').clubId = 'club-2';

    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-pieds', quantity: 1 }]),
    ).rejects.toThrow('Pièce introuvable.');
  });

  it('refuse un produit en précommande, et des précommandes qui attendent la déclinaison', async () => {
    const pre = makeHarness({
      variants: [
        VARIANT({ id: 'v-pack', productId: 'p-pack' }),
        VARIANT({ id: 'v-gants', productId: 'p-gants', onHand: 4, available: 4 }),
      ],
      preorderEnabled: { 'p-pack': true },
    });
    await expect(
      pre.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 1 }]),
    ).rejects.toThrow('ne se précommande pas');

    const waiting = makeHarness({
      variants: [
        VARIANT({ id: 'v-pack', productId: 'p-pack' }),
        VARIANT({ id: 'v-gants', productId: 'p-gants', onHand: 4, available: 4 }),
      ],
      awaiting: 2,
    });
    await expect(
      waiting.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 1 }]),
    ).rejects.toThrow('Des précommandes attendent');
    expect(waiting.row('v-pack').isBundle).toBe(false);
  });

  it('refuse les doublons et les quantités hors bornes avant toute lecture', async () => {
    const h = kit();

    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pack', [
        { componentVariantId: 'v-gants', quantity: 1 },
        { componentVariantId: 'v-gants', quantity: 1 },
      ]),
    ).rejects.toThrow(BadRequestException);
    await expect(
      h.svc.setBundleComponents(CLUB, 'v-pack', [{ componentVariantId: 'v-gants', quantity: 0 }]),
    ).rejects.toThrow('de 1 à 99');
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('bundleCounters — stock dérivé d’un pack (ADR-0024)', () => {
  const part = (
    quantity: number,
    c: Partial<{ active: boolean; trackStock: boolean; onHand: number; available: number }>,
  ) => ({
    quantity,
    component: { active: true, trackStock: true, onHand: 0, available: 0, ...c },
  });

  it('le minimum des pièces, chacune divisée par sa quantité, arrondi vers le bas', () => {
    expect(
      bundleCounters([
        part(1, { onHand: 6, available: 4 }),
        part(2, { onHand: 9, available: 7 }),
      ]),
    ).toEqual({ trackStock: true, onHand: 4, available: 3 });
  });

  it('une seule pièce épuisée épuise le pack', () => {
    expect(
      bundleCounters([part(1, { onHand: 9, available: 9 }), part(1, { onHand: 0, available: 0 })])
        .available,
    ).toBe(0);
  });

  it('une pièce retirée de la vente bloque le pack, même en stock', () => {
    expect(
      bundleCounters([part(1, { available: 9, onHand: 9 }), part(1, { active: false, available: 9 })])
        .available,
    ).toBe(0);
  });

  it('un pack sans pièce n’a rien à vendre — il n’est pas illimité', () => {
    expect(bundleCounters([])).toEqual({ trackStock: true, onHand: 0, available: 0 });
  });

  it('une pièce non suivie ne limite pas ; toutes non suivies, le pack est illimité', () => {
    expect(
      bundleCounters([part(1, { trackStock: false }), part(1, { onHand: 2, available: 2 })]),
    ).toEqual({ trackStock: true, onHand: 2, available: 2 });
    expect(bundleCounters([part(1, { trackStock: false })]).trackStock).toBe(false);
  });

  it('stockOf lit les compteurs propres hors pack, ceux des pièces pour un pack', () => {
    const plain = { isBundle: false, trackStock: true, onHand: 5, available: 3 };
    expect(stockOf(plain)).toEqual({ trackStock: true, onHand: 5, available: 3 });
    expect(
      stockOf({
        isBundle: true,
        trackStock: false,
        onHand: 0,
        available: 0,
        bundleComponents: [part(1, { onHand: 2, available: 2 })],
      }),
    ).toEqual({ trackStock: true, onHand: 2, available: 2 });
    // Pièces non chargées : compté épuisé, jamais illimité.
    expect(stockOf({ isBundle: true, trackStock: false, onHand: 0, available: 0 })).toMatchObject({
      available: 0,
      trackStock: true,
    });
  });
});
