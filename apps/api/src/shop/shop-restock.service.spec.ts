import { ShopRestockService } from './shop-restock.service';

/**
 * Le plan du club — ADR-0021 §3 : ce que le service LIT avant de laisser le
 * plan décider.
 *
 * Les compteurs (encours, précommandes, brouillons) ont leurs propres specs ;
 * ici leurs doubles rendent des valeurs NON NULLES, sans quoi un compteur
 * oublié passerait inaperçu. Le double Prisma applique exactement les clauses du
 * `where` et lève sur celles qu'il ne sait pas lire (cf.
 * docs/memory/pitfalls/double-ignore-une-clause-du-where.md).
 */

type VariantRow = {
  id: string;
  clubId: string;
  productId: string;
  label: string | null;
  sku: string | null;
  available: number;
  onHand: number;
  reorderThreshold: number | null;
  reorderTargetQty: number | null;
  lowStockAlertedAt: Date | null;
  trackStock: boolean;
  active: boolean;
};
type ProductRow = {
  id: string;
  clubId: string;
  name: string;
  active: boolean;
  preferredSupplierId: string | null;
};
type OfferRow = {
  id: string;
  productId: string;
  supplierId: string;
  supplierRef: string | null;
  unitCostCents: number | null;
  packSize: number;
};
type OverrideRow = {
  offerId: string;
  variantId: string;
  supplierRef: string | null;
  unitCostCents: number | null;
};

const CLUB = 'club-1';

function declinaison(over: Partial<VariantRow> & { id: string }): VariantRow {
  return {
    clubId: CLUB,
    productId: 'p-1',
    label: over.id,
    sku: null,
    available: 0,
    onHand: 0,
    reorderThreshold: 5,
    reorderTargetQty: 20,
    lowStockAlertedAt: null,
    trackStock: true,
    active: true,
    ...over,
  };
}

/** Le `where` tel que Prisma l'appliquerait ; `product` filtre le produit parent. */
function matches(
  row: VariantRow,
  where: Record<string, unknown>,
  productOf: (row: VariantRow) => ProductRow,
): boolean {
  return Object.entries(where).every(([field, clause]) => {
    if (field === 'product') {
      const product = productOf(row);
      return Object.entries(clause as Record<string, unknown>).every(([key, value]) => {
        if (!(key in product)) throw new Error(`Champ produit non simulé : ${key}`);
        return product[key as keyof ProductRow] === value;
      });
    }
    if (!(field in row)) throw new Error(`Champ non simulé : ${field}`);
    if (clause !== null && typeof clause === 'object') {
      throw new Error(`Opérateur non simulé : ${field}`);
    }
    return row[field as keyof VariantRow] === clause;
  });
}

function makeWorld(seed: {
  variants: VariantRow[];
  products: ProductRow[];
  offers?: OfferRow[];
  overrides?: OverrideRow[];
  suppliers?: Array<{ id: string; name: string; active: boolean }>;
  onOrder?: Record<string, number>;
  preordered?: Record<string, number>;
  inDraft?: Record<string, number>;
}) {
  const offers = seed.offers ?? [];
  const overrides = seed.overrides ?? [];
  const suppliers = seed.suppliers ?? [];
  const productOf = (v: VariantRow) => {
    const product = seed.products.find((p) => p.id === v.productId);
    if (!product) throw new Error(`Produit inconnu : ${v.productId}`);
    return product;
  };

  const prisma = {
    shopProductVariant: {
      findMany: jest.fn(async (args: { where: Record<string, unknown>; select: object }) => {
        for (const key of Object.keys(args)) {
          if (!['where', 'select'].includes(key)) throw new Error(`Argument non simulé : ${key}`);
        }
        return seed.variants
          .filter((v) => matches(v, args.where, productOf))
          .map((v) => {
            const product = productOf(v);
            return {
              id: v.id,
              productId: v.productId,
              label: v.label,
              sku: v.sku,
              available: v.available,
              onHand: v.onHand,
              reorderThreshold: v.reorderThreshold,
              reorderTargetQty: v.reorderTargetQty,
              lowStockAlertedAt: v.lowStockAlertedAt,
              product: {
                name: product.name,
                preferredSupplierId: product.preferredSupplierId,
                supplierOffers: offers
                  .filter((o) => o.productId === product.id)
                  .map((o) => {
                    const supplier = suppliers.find((s) => s.id === o.supplierId);
                    if (!supplier) throw new Error(`Fournisseur inconnu : ${o.supplierId}`);
                    return {
                      supplierId: o.supplierId,
                      supplierRef: o.supplierRef,
                      unitCostCents: o.unitCostCents,
                      packSize: o.packSize,
                      supplier: { name: supplier.name, active: supplier.active },
                      variantOverrides: overrides
                        .filter((x) => x.offerId === o.id)
                        .map(({ variantId, supplierRef, unitCostCents }) => ({
                          variantId,
                          supplierRef,
                          unitCostCents,
                        })),
                    };
                  }),
              },
            };
          });
      }),
    },
  };

  const counter = (values: Record<string, number> = {}) =>
    jest.fn(async (_clubId: string, ids: string[]) =>
      new Map(ids.filter((id) => values[id] !== undefined).map((id) => [id, values[id]])),
    );
  const purchases = {
    onOrderByVariant: counter(seed.onOrder),
    draftQtyByVariant: counter(seed.inDraft),
  };
  const preorders = { preorderedByVariant: counter(seed.preordered) };
  const svc = new ShopRestockService(prisma as never, purchases as never, preorders as never);
  return { svc };
}

describe('ShopRestockService.plan — ce que le plan reçoit', () => {
  it('assemble compteurs et conditions effectives, exception de la déclinaison comprise', async () => {
    const { svc } = makeWorld({
      products: [{ id: 'p-1', clubId: CLUB, name: 'T-shirt', active: true, preferredSupplierId: 'sup-a' }],
      variants: [
        declinaison({
          id: 'v-m',
          label: 'M',
          sku: 'TS-M-001',
          available: 2,
          onHand: 4,
          reorderThreshold: 5,
          reorderTargetQty: 20,
          lowStockAlertedAt: new Date('2026-09-13T07:00:00Z'),
        }),
        declinaison({ id: 'v-xxl', label: 'XXL', available: 1, reorderThreshold: 3, reorderTargetQty: null }),
      ],
      suppliers: [
        { id: 'sup-a', name: 'Textiles Pro', active: true },
        { id: 'sup-b', name: 'Sport Import', active: false },
      ],
      offers: [
        { id: 'off-a', productId: 'p-1', supplierId: 'sup-a', supplierRef: 'TS-100', unitCostCents: 850, packSize: 10 },
        { id: 'off-b', productId: 'p-1', supplierId: 'sup-b', supplierRef: 'SI-200', unitCostCents: 700, packSize: 1 },
      ],
      overrides: [{ offerId: 'off-a', variantId: 'v-xxl', supplierRef: null, unitCostCents: 990 }],
      onOrder: { 'v-m': 5 },
      preordered: { 'v-m': 1 },
      inDraft: { 'v-xxl': 2 },
    });

    const plan = await svc.plan(CLUB);

    expect(plan.groups.map((g) => [g.supplierId, g.supplierName])).toEqual([
      ['sup-a', 'Textiles Pro'],
    ]);
    const [m, xxl] = plan.groups[0].lines;
    // M : 20 + 1 − 2 − 5 − 0 = 14, vendu par 10 → 20, au prix de l'offre.
    expect(m).toMatchObject({
      variantId: 'v-m',
      productId: 'p-1',
      productName: 'T-shirt',
      label: 'M',
      sku: 'TS-M-001',
      onHand: 4,
      alertedAt: new Date('2026-09-13T07:00:00Z'),
      onOrder: 5,
      preordered: 1,
      inDraft: 0,
      shortfall: 14,
      suggestedQty: 20,
      supplier: { supplierRef: 'TS-100', unitCostCents: 850, packSize: 10 },
    });
    // XXL : (3 + 1) + 0 − 1 − 0 − 2 = 1 → 10 ; son exception de prix chez A, pas chez B.
    expect(xxl).toMatchObject({
      variantId: 'v-xxl',
      inDraft: 2,
      target: 4,
      shortfall: 1,
      suggestedQty: 10,
      supplier: { supplierRef: 'TS-100', unitCostCents: 990 },
    });
    // B est désactivé : son offre reste sur la ligne, signalée comme telle.
    expect(
      xxl.offers.map((o) => [o.supplierId, o.supplierName, o.unitCostCents, o.supplierActive]),
    ).toEqual([
      ['sup-a', 'Textiles Pro', 990, true],
      ['sup-b', 'Sport Import', 700, false],
    ]);
  });

  it('écarte les déclinaisons non suivies, retirées de la vente, ou d’un produit retiré', async () => {
    const { svc } = makeWorld({
      products: [
        { id: 'p-1', clubId: CLUB, name: 'T-shirt', active: true, preferredSupplierId: null },
        { id: 'p-off', clubId: CLUB, name: 'Ancien sac', active: false, preferredSupplierId: null },
      ],
      variants: [
        declinaison({ id: 'suivie' }),
        declinaison({ id: 'illimitee', trackStock: false }),
        declinaison({ id: 'retiree', active: false }),
        declinaison({ id: 'produit-retire', productId: 'p-off' }),
        declinaison({ id: 'autre-club', clubId: 'club-2' }),
      ],
    });

    const plan = await svc.plan(CLUB);

    const all = [
      ...plan.groups.flatMap((g) => g.lines),
      ...plan.withoutSupplier,
      ...plan.inactiveSupplier,
      ...plan.covered,
    ];
    expect(all.map((l) => l.variantId)).toEqual(['suivie']);
  });
});
