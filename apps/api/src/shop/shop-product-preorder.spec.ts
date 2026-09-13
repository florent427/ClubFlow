import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import type { ShopStockService } from './shop-stock.service';
import { ShopService } from './shop.service';

/**
 * Fiche produit : réglages de précommande (ADR-0018).
 *
 * Le double rend ce que la base rendrait — défauts de colonne compris — et
 * applique les écritures telles quelles : un réglage que le service
 * n'écrirait pas resterait visible à sa valeur d'avant.
 */

const NOW = new Date('2026-09-13T10:00:00Z');

type ProductRow = {
  id: string;
  clubId: string;
  sku: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  stock: number | null;
  active: boolean;
  preorderEnabled: boolean;
  preorderLeadTime: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type VariantRow = Record<string, any> & {
  id: string;
  productId: string;
  isDefault: boolean;
};

function makeHarness(
  seed: { products?: ProductRow[]; variants?: VariantRow[] } = {},
) {
  const products = seed.products ?? [];
  const variants = seed.variants ?? [];
  let seq = 0;

  const withVariants = (p: ProductRow, onlyDefault: boolean) => ({
    ...p,
    variants: variants
      .filter((v) => v.productId === p.id && (!onlyDefault || v.isDefault))
      .map((v) => ({ ...v })),
  });

  const db: any = {
    shopProduct: {
      create: jest.fn(async ({ data }: any) => {
        const row: ProductRow = {
          id: `p-${++seq}`,
          // Défauts de la base (schema.prisma).
          preorderEnabled: false,
          preorderLeadTime: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...data,
        };
        products.push(row);
        return { ...row };
      }),
      findFirst: jest.fn(async ({ where, include }: any) => {
        const p = products.find(
          (x) => x.id === where.id && x.clubId === where.clubId,
        );
        return p
          ? withVariants(p, include?.variants?.where?.isDefault === true)
          : null;
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const p = products.find(
          (x) => x.id === where.id && x.clubId === where.clubId,
        );
        if (!p) throw new Error('product not found');
        return withVariants(p, false);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const p = products.find((x) => x.id === where.id);
        if (!p) throw new Error('product not found');
        Object.assign(p, data);
        return { ...p };
      }),
    },
    shopProductVariant: {
      create: jest.fn(async ({ data }: any) => {
        const row: VariantRow = {
          id: `v-${++seq}`,
          active: true,
          avgCostCents: 0,
          reorderTargetQty: null,
          lowStockAlertedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
          ...data,
        };
        variants.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const v = variants.find((x) => x.id === where.id);
        if (!v) throw new Error('variant not found');
        Object.assign(v, data);
        return { ...v };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(db),
    ),
  };

  /** Ordre des gestes : la correction de stock, puis l'attribution. */
  const calls: string[] = [];
  const stock = {
    open: jest.fn(async () => undefined),
    adjust: jest.fn(async () => {
      calls.push('adjust');
      return undefined;
    }),
  };
  const purchases = {
    onOrderByVariant: jest.fn(async () => new Map<string, number>()),
  };
  const preorders = {
    resumeTrackingInTx: jest.fn(
      async (_tx: unknown, _args: unknown): Promise<number | null> => {
        calls.push('reprise');
        return 0;
      },
    ),
    preorderedByVariant: jest.fn(async () => new Map<string, number>()),
    allocateQuietly: jest.fn(
      async (_clubId: string, _variantIds: Iterable<string>): Promise<void> => {
        calls.push('attribution');
      },
    ),
  };
  const svc = new ShopService(
    db as unknown as PrismaService,
    stock as unknown as ShopStockService,
    purchases as unknown as ShopPurchaseOrdersService,
    preorders as never,
  );
  return { svc, db, products, variants, stock, preorders, calls };
}

const PRODUIT = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: 'p-kimono',
  clubId: 'club-1',
  sku: null,
  name: 'Kimono',
  description: null,
  imageUrl: null,
  priceCents: 4500,
  stock: null,
  active: true,
  preorderEnabled: true,
  preorderLeadTime: '3 semaines',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const DEFAUT = (over: Record<string, any> = {}): VariantRow => ({
  id: 'v-kimono',
  clubId: 'club-1',
  productId: 'p-kimono',
  optionSignature: '',
  isDefault: true,
  label: null,
  sku: null,
  priceCents: null,
  trackStock: true,
  onHand: 0,
  available: 0,
  avgCostCents: 0,
  reorderThreshold: null,
  reorderTargetQty: null,
  lowStockAlertedAt: null,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('ShopService.createProduct — réglages de précommande (ADR-0018)', () => {
  it('ouvre la précommande avec son délai, blancs retirés', async () => {
    const h = makeHarness();

    const p = await h.svc.createProduct('club-1', {
      name: 'Kimono',
      priceCents: 4500,
      stock: 0,
      preorderEnabled: true,
      preorderLeadTime: '  3 à 4 semaines  ',
    });

    expect(h.products[0]).toMatchObject({
      preorderEnabled: true,
      preorderLeadTime: '3 à 4 semaines',
    });
    expect(p).toMatchObject({
      preorderEnabled: true,
      preorderLeadTime: '3 à 4 semaines',
    });
  });

  it('par défaut : ni précommande ni délai — et un délai blanc ne compte pas', async () => {
    const h = makeHarness();

    await h.svc.createProduct('club-1', { name: 'Gants', priceCents: 2000 });
    await h.svc.createProduct('club-1', {
      name: 'Ceinture',
      priceCents: 900,
      preorderLeadTime: '   ',
    });

    expect(h.products[0]).toMatchObject({
      preorderEnabled: false,
      preorderLeadTime: null,
    });
    expect(h.products[1]).toMatchObject({
      preorderEnabled: false,
      preorderLeadTime: null,
    });
  });
});

describe('ShopService.updateProduct — réglages de précommande (ADR-0018)', () => {
  it('un `null` ne décoche rien ; `false` ferme la précommande ; un délai vide s’efface', async () => {
    const h = makeHarness({ products: [PRODUIT()], variants: [DEFAUT()] });

    await h.svc.updateProduct('club-1', 'p-kimono', {
      preorderEnabled: null,
      preorderLeadTime: undefined,
    });
    expect(h.products[0]).toMatchObject({
      preorderEnabled: true,
      preorderLeadTime: '3 semaines',
    });

    await h.svc.updateProduct('club-1', 'p-kimono', {
      preorderEnabled: false,
      preorderLeadTime: '',
    });
    expect(h.products[0]).toMatchObject({
      preorderEnabled: false,
      preorderLeadTime: null,
    });
  });

  it('un stock saisi sur la fiche sert les précommandes, APRÈS la correction', async () => {
    const h = makeHarness({ products: [PRODUIT()], variants: [DEFAUT()] });

    await h.svc.updateProduct('club-1', 'p-kimono', { stock: 6 });

    expect(h.calls).toEqual(['adjust', 'attribution']);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', [
      'v-kimono',
    ]);
  });

  it('passer en stock illimité sert aussi les précommandes', async () => {
    const h = makeHarness({ products: [PRODUIT()], variants: [DEFAUT()] });

    await h.svc.updateProduct('club-1', 'p-kimono', { stock: null });

    expect(h.variants[0].trackStock).toBe(false);
    expect(h.preorders.allocateQuietly).toHaveBeenCalledWith('club-1', [
      'v-kimono',
    ]);
  });

  it('modifier le nom ne déclenche aucune attribution', async () => {
    const h = makeHarness({ products: [PRODUIT()], variants: [DEFAUT()] });

    await h.svc.updateProduct('club-1', 'p-kimono', {
      name: 'Kimono compétition',
    });

    expect(h.preorders.allocateQuietly).not.toHaveBeenCalled();
  });

  it('passer d’illimité à suivi reprend le suivi AVANT la correction : les ventes déjà passées sont servies', async () => {
    const h = makeHarness({
      products: [PRODUIT()],
      variants: [DEFAUT({ trackStock: false })],
    });

    await h.svc.updateProduct('club-1', 'p-kimono', { stock: 4 });

    expect(h.calls).toEqual(['reprise', 'adjust', 'attribution']);
    expect(h.preorders.resumeTrackingInTx).toHaveBeenCalledWith(
      h.db,
      expect.objectContaining({ clubId: 'club-1', variantId: 'v-kimono' }),
    );
    // Plus de remise à zéro aveugle : elle effaçait sans le dire ce que les
    // commandes en cours avaient réservé.
    expect(h.stock.open).not.toHaveBeenCalled();
  });

  it('stock déjà suivi : pas de reprise', async () => {
    const h = makeHarness({ products: [PRODUIT()], variants: [DEFAUT()] });

    await h.svc.updateProduct('club-1', 'p-kimono', { stock: 4 });

    expect(h.preorders.resumeTrackingInTx).not.toHaveBeenCalled();
  });
});
