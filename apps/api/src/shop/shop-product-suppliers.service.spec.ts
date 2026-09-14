import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShopProductSuppliersService } from './shop-product-suppliers.service';

/**
 * Fournisseurs d'un produit — ADR-0021 §1-2.
 *
 * Le double SIMULE PostgreSQL, y compris les deux contraintes qui portent la
 * garantie : l'unicité produit × fournisseur, et la clé étrangère COMPOSITE du
 * fournisseur choisi. Il refuse donc, comme la base, de choisir un fournisseur
 * non rattaché et de retirer l'offre choisie ; chaque écriture est atomique et
 * `$transaction` annule pour de vrai. Sans cette simulation, retirer
 * l'effacement du choix passerait les tests : c'est la base qui le rend
 * nécessaire.
 *
 * Il applique exactement les clauses écrites par le service et lève sur celles
 * qu'il ne sait pas lire (cf. pitfalls/double-ignore-une-clause-du-where.md).
 */

type ProductRow = { id: string; clubId: string; preferredSupplierId: string | null };
type SupplierRow = { id: string; clubId: string; name: string; active: boolean };
type OfferRow = {
  id: string;
  clubId: string;
  productId: string;
  supplierId: string;
  supplierRef: string | null;
  unitCostCents: number | null;
  packSize: number;
};
type OverrideRow = {
  id: string;
  clubId: string;
  offerId: string;
  variantId: string;
  supplierRef: string | null;
  unitCostCents: number | null;
};
type VariantRow = { id: string; clubId: string; productId: string };

const CLUB = 'club-1';

function knownError(code: 'P2002' | 'P2003') {
  return new Prisma.PrismaClientKnownRequestError(`contrainte ${code}`, {
    code,
    clientVersion: 'test',
  });
}

function produit(preferredSupplierId: string | null, id = 'p-1'): ProductRow {
  return { id, clubId: CLUB, preferredSupplierId };
}

function offre(supplierId: string, over: Partial<OfferRow> = {}): OfferRow {
  return {
    id: `off-${supplierId}`,
    clubId: CLUB,
    productId: 'p-1',
    supplierId,
    supplierRef: null,
    unitCostCents: null,
    packSize: 1,
    ...over,
  };
}

type Relations = Record<string, (row: Record<string, unknown>) => Record<string, unknown>[]>;

/** Le `where` tel que Prisma l'appliquerait, une clause à la fois. */
function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
  relations: Relations = {},
): boolean {
  return Object.entries(where).every(([field, clause]) => {
    if (field in relations) {
      const children = relations[field](row);
      const { every, ...rest } = clause as { every?: Record<string, unknown> };
      if (Object.keys(rest).length > 0) {
        throw new Error(`Filtre de relation non simulé : ${field}`);
      }
      return every === undefined || children.every((c) => matches(c, every));
    }
    if (!(field in row)) throw new Error(`Champ non simulé : ${field}`);
    const value = row[field];
    if (clause === null || typeof clause !== 'object') return value === clause;
    return Object.entries(clause).every(([op, operand]) => {
      if (op === 'not') return value !== operand;
      if (op === 'in') return (operand as unknown[]).includes(value);
      throw new Error(`Opérateur non simulé : ${field}.${op}`);
    });
  });
}

function makeWorld(
  seed: {
    products?: ProductRow[];
    suppliers?: SupplierRow[];
    offers?: OfferRow[];
    overrides?: OverrideRow[];
    variants?: VariantRow[];
  } = {},
) {
  const db = {
    products: seed.products ?? [produit(null)],
    suppliers: seed.suppliers ?? [
      { id: 'sup-a', clubId: CLUB, name: 'Textiles Pro', active: true },
      { id: 'sup-b', clubId: CLUB, name: 'Sport Import', active: true },
    ],
    offers: seed.offers ?? [],
    overrides: seed.overrides ?? [],
    variants: seed.variants ?? [{ id: 'v-1', clubId: CLUB, productId: 'p-1' }],
  };
  let seq = 0;

  const productRelations: Relations = {
    supplierOffers: (row) => db.offers.filter((o) => o.productId === row.id),
  };

  const snapshot = () => ({
    products: db.products.map((r) => ({ ...r })),
    offers: db.offers.map((r) => ({ ...r })),
    overrides: db.overrides.map((r) => ({ ...r })),
  });
  const restore = (s: ReturnType<typeof snapshot>) => {
    db.products.splice(0, db.products.length, ...s.products);
    db.offers.splice(0, db.offers.length, ...s.offers);
    db.overrides.splice(0, db.overrides.length, ...s.overrides);
  };

  /**
   * Une instruction SQL : entièrement appliquée, ou pas du tout. La clé
   * étrangère composite est vérifiée à sa fin, comme `NoAction` le fait.
   */
  const statement = <T>(write: () => T): T => {
    const before = snapshot();
    try {
      const out = write();
      for (const p of db.products) {
        if (p.preferredSupplierId === null) continue;
        const linked = db.offers.some(
          (o) => o.productId === p.id && o.supplierId === p.preferredSupplierId,
        );
        if (!linked) throw knownError('P2003');
      }
      return out;
    } catch (err) {
      restore(before);
      throw err;
    }
  };

  const tables = {
    shopProduct: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = db.products.find((r) => matches(r, where, productRelations));
        return row ? { ...row } : null;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<ProductRow> }) =>
          statement(() => {
            const hit = db.products.filter((r) => matches(r, where, productRelations));
            hit.forEach((r) => Object.assign(r, data));
            return { count: hit.length };
          }),
      ),
    },
    shopSupplier: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = db.suppliers.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
    },
    shopProductVariant: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = db.variants.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
    },
    shopProductSupplier: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = db.offers.find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      groupBy: jest.fn(
        async (args: { by: string[]; where: Record<string, unknown> }) => {
          if (args.by.join() !== 'supplierId') {
            throw new Error(`Regroupement non simulé : ${args.by.join()}`);
          }
          const counts = new Map<string, number>();
          for (const o of db.offers.filter((r) => matches(r, args.where))) {
            counts.set(o.supplierId, (counts.get(o.supplierId) ?? 0) + 1);
          }
          return [...counts].map(([supplierId, n]) => ({
            supplierId,
            _count: { _all: n },
          }));
        },
      ),
      create: jest.fn(async ({ data }: { data: Omit<OfferRow, 'id'> }) =>
        statement(() => {
          if (
            db.offers.some(
              (o) => o.productId === data.productId && o.supplierId === data.supplierId,
            )
          ) {
            throw knownError('P2002');
          }
          const row = { id: `off-${++seq}`, ...data };
          db.offers.push(row);
          return { ...row };
        }),
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<OfferRow> }) =>
          statement(() => {
            const row = db.offers.find((o) => o.id === where.id);
            if (!row) throw new Error(`Offre inconnue : ${where.id}`);
            Object.assign(row, data);
            return { ...row };
          }),
      ),
      deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        statement(() => {
          const hit = db.offers.filter((r) => matches(r, where));
          const ids = new Set(hit.map((o) => o.id));
          db.offers.splice(0, db.offers.length, ...db.offers.filter((o) => !ids.has(o.id)));
          // `onDelete: Cascade` : les exceptions partent avec leur offre.
          db.overrides.splice(
            0,
            db.overrides.length,
            ...db.overrides.filter((x) => !ids.has(x.offerId)),
          );
          return { count: hit.length };
        }),
      ),
    },
    shopProductSupplierVariant: {
      deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        statement(() => {
          const hit = db.overrides.filter((r) => matches(r, where));
          db.overrides.splice(
            0,
            db.overrides.length,
            ...db.overrides.filter((x) => !hit.includes(x)),
          );
          return { count: hit.length };
        }),
      ),
      upsert: jest.fn(
        async (args: {
          where: { offerId_variantId: { offerId: string; variantId: string } };
          create: Omit<OverrideRow, 'id'>;
          update: Partial<OverrideRow>;
        }) =>
          statement(() => {
            const key = args.where.offerId_variantId;
            const row = db.overrides.find(
              (x) => x.offerId === key.offerId && x.variantId === key.variantId,
            );
            if (row) {
              Object.assign(row, args.update);
              return { ...row };
            }
            const created = { id: `ovr-${++seq}`, ...args.create };
            db.overrides.push(created);
            return { ...created };
          }),
      ),
    },
  };
  const prisma = {
    ...tables,
    $transaction: jest.fn(
      async (fn: (tx: typeof tables) => Promise<unknown>): Promise<unknown> => {
        const before = snapshot();
        try {
          return await fn(tables);
        } catch (err) {
          restore(before);
          throw err;
        }
      },
    ),
  };

  const shop = {
    reloadProduct: jest.fn(async (_clubId: string, productId: string) => ({
      reloaded: productId,
    })),
  };
  const svc = new ShopProductSuppliersService(prisma as never, shop as never);
  const terms = () =>
    db.offers.map((o) => [o.supplierId, o.supplierRef, o.unitCostCents, o.packSize]);
  return { svc, db, shop, terms };
}

describe('ShopProductSuppliersService — rattacher un fournisseur (ADR-0021 §1)', () => {
  it('le premier fournisseur rattaché est choisi d’office, le second non', async () => {
    const w = makeWorld();

    await w.svc.upsertOffer(CLUB, {
      productId: 'p-1',
      supplierId: 'sup-a',
      supplierRef: ' TS-100 ',
      unitCostCents: 850,
      packSize: 10,
    });
    await w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-b' });

    expect(w.terms()).toEqual([
      ['sup-a', 'TS-100', 850, 10],
      ['sup-b', null, null, 1],
    ]);
    expect(w.db.products[0].preferredSupplierId).toBe('sup-a');
    expect(w.shop.reloadProduct).toHaveBeenLastCalledWith(CLUB, 'p-1');
  });

  it('un produit déjà fourni dont le choix a été retiré ne se le voit pas réimposer', async () => {
    const w = makeWorld({ offers: [offre('sup-a')] });

    await w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-b' });

    expect(w.db.offers).toHaveLength(2);
    expect(w.db.products[0].preferredSupplierId).toBeNull();
  });

  it('met à jour une offre : un champ absent reste en place, null l’efface', async () => {
    const w = makeWorld({
      products: [produit('sup-a')],
      offers: [offre('sup-a', { supplierRef: 'TS-100', unitCostCents: 850, packSize: 10 })],
    });

    await w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a', unitCostCents: 900 });
    expect(w.terms()).toEqual([['sup-a', 'TS-100', 900, 10]]);

    await w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a', supplierRef: null });
    expect(w.terms()).toEqual([['sup-a', null, 900, 10]]);
  });

  it('refuse le produit ou le fournisseur d’un autre club, sans rien écrire', async () => {
    const w = makeWorld({
      products: [produit(null), { id: 'p-2', clubId: 'club-2', preferredSupplierId: null }],
      suppliers: [
        { id: 'sup-a', clubId: CLUB, name: 'Textiles Pro', active: true },
        { id: 'sup-x', clubId: 'club-2', name: 'Autre club', active: true },
      ],
    });

    await expect(
      w.svc.upsertOffer(CLUB, { productId: 'p-2', supplierId: 'sup-a' }),
    ).rejects.toThrow('Produit introuvable.');
    await expect(
      w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-x' }),
    ).rejects.toThrow('Fournisseur introuvable.');
    expect(w.db.offers).toEqual([]);
  });

  it('un fournisseur désactivé garde son offre, mais n’en reçoit pas de nouvelle', async () => {
    const w = makeWorld({
      products: [produit('sup-a'), produit(null, 'p-2')],
      suppliers: [{ id: 'sup-a', clubId: CLUB, name: 'Textiles Pro', active: false }],
      offers: [offre('sup-a', { unitCostCents: 850 })],
    });

    await w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a', unitCostCents: 870 });
    const refused = w.svc.upsertOffer(CLUB, { productId: 'p-2', supplierId: 'sup-a' });

    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow('désactivé');
    expect(w.terms()).toEqual([['sup-a', null, 870, 1]]);
    expect(w.db.products[1].preferredSupplierId).toBeNull();
  });

  it('refuse un colisage nul et un prix d’achat négatif', async () => {
    const w = makeWorld();

    await expect(
      w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a', packSize: 0 }),
    ).rejects.toThrow('colisage');
    await expect(
      w.svc.upsertOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a', unitCostCents: -1 }),
    ).rejects.toThrow('négatif');
    expect(w.db.offers).toEqual([]);
  });
});

describe('ShopProductSuppliersService — le fournisseur choisi (ADR-0021 §2)', () => {
  it('choisir un autre fournisseur rattaché déplace le choix', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a'), offre('sup-b')] });

    await w.svc.setPreferredSupplier(CLUB, { productId: 'p-1', supplierId: 'sup-b' });

    expect(w.db.products[0].preferredSupplierId).toBe('sup-b');
  });

  it('refuse un fournisseur non rattaché : la base le refuse, le choix ne bouge pas', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a')] });

    const refused = w.svc.setPreferredSupplier(CLUB, { productId: 'p-1', supplierId: 'sup-b' });

    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow('Rattachez d’abord');
    expect(w.db.products[0].preferredSupplierId).toBe('sup-a');
  });

  it('refuse de choisir un fournisseur désactivé', async () => {
    const w = makeWorld({
      products: [produit('sup-a')],
      suppliers: [
        { id: 'sup-a', clubId: CLUB, name: 'Textiles Pro', active: true },
        { id: 'sup-b', clubId: CLUB, name: 'Sport Import', active: false },
      ],
      offers: [offre('sup-a'), offre('sup-b')],
    });

    await expect(
      w.svc.setPreferredSupplier(CLUB, { productId: 'p-1', supplierId: 'sup-b' }),
    ).rejects.toThrow('désactivé');
    expect(w.db.products[0].preferredSupplierId).toBe('sup-a');
  });

  it('retirer le choix sort l’article du réapprovisionnement, sans toucher aux offres', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a')] });

    await w.svc.setPreferredSupplier(CLUB, { productId: 'p-1', supplierId: null });

    expect(w.db.products[0].preferredSupplierId).toBeNull();
    expect(w.db.offers).toHaveLength(1);
  });
});

describe('ShopProductSuppliersService — retirer un fournisseur', () => {
  it('une offre non choisie part avec ses exceptions, le choix reste', async () => {
    const w = makeWorld({
      products: [produit('sup-a')],
      offers: [offre('sup-a'), offre('sup-b')],
      overrides: [
        {
          id: 'ovr-1',
          clubId: CLUB,
          offerId: 'off-sup-b',
          variantId: 'v-1',
          supplierRef: 'SI-XXL',
          unitCostCents: 990,
        },
      ],
    });

    await w.svc.removeOffer(CLUB, { productId: 'p-1', supplierId: 'sup-b' });

    expect(w.db.offers.map((o) => o.supplierId)).toEqual(['sup-a']);
    expect(w.db.overrides).toEqual([]);
    expect(w.db.products[0].preferredSupplierId).toBe('sup-a');
  });

  it('refuse de retirer l’offre choisie tant qu’il en reste une autre — rien ne bouge', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a'), offre('sup-b')] });

    const refused = w.svc.removeOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a' });

    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow('fournisseur choisi');
    expect(w.db.offers).toHaveLength(2);
    expect(w.db.products[0].preferredSupplierId).toBe('sup-a');
  });

  it('retirer la dernière offre retire le choix avec elle', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a')] });

    await w.svc.removeOffer(CLUB, { productId: 'p-1', supplierId: 'sup-a' });

    expect(w.db.offers).toEqual([]);
    expect(w.db.products[0].preferredSupplierId).toBeNull();
  });

  it('un fournisseur qui n’est pas rattaché est introuvable', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a')] });

    await expect(
      w.svc.removeOffer(CLUB, { productId: 'p-1', supplierId: 'sup-b' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(w.db.offers).toHaveLength(1);
  });
});

describe('ShopProductSuppliersService — exceptions par déclinaison (ADR-0021 §1)', () => {
  it('pose, remplace puis efface l’exception d’une déclinaison', async () => {
    const w = makeWorld({ products: [produit('sup-a')], offers: [offre('sup-a')] });
    const exceptions = () => w.db.overrides.map((x) => [x.variantId, x.supplierRef, x.unitCostCents]);

    await w.svc.setVariantOverride(CLUB, {
      offerId: 'off-sup-a',
      variantId: 'v-1',
      supplierRef: 'TS-100-XXL',
      unitCostCents: 990,
    });
    expect(exceptions()).toEqual([['v-1', 'TS-100-XXL', 990]]);

    await w.svc.setVariantOverride(CLUB, { offerId: 'off-sup-a', variantId: 'v-1', unitCostCents: 1010 });
    expect(exceptions()).toEqual([['v-1', null, 1010]]);

    await w.svc.setVariantOverride(CLUB, { offerId: 'off-sup-a', variantId: 'v-1', supplierRef: '  ' });
    expect(exceptions()).toEqual([]);
    expect(w.shop.reloadProduct).toHaveBeenLastCalledWith(CLUB, 'p-1');
  });

  it('refuse la déclinaison d’un autre produit', async () => {
    const w = makeWorld({
      products: [produit('sup-a'), produit(null, 'p-2')],
      offers: [offre('sup-a')],
      variants: [
        { id: 'v-1', clubId: CLUB, productId: 'p-1' },
        { id: 'v-9', clubId: CLUB, productId: 'p-2' },
      ],
    });

    await expect(
      w.svc.setVariantOverride(CLUB, { offerId: 'off-sup-a', variantId: 'v-9', unitCostCents: 990 }),
    ).rejects.toThrow('Déclinaison introuvable pour ce produit.');
    expect(w.db.overrides).toEqual([]);
  });

  it('refuse l’offre d’un autre club', async () => {
    const w = makeWorld({ offers: [offre('sup-a', { clubId: 'club-2' })] });

    await expect(
      w.svc.setVariantOverride(CLUB, { offerId: 'off-sup-a', variantId: 'v-1', unitCostCents: 990 }),
    ).rejects.toThrow('Fournisseur du produit introuvable.');
    expect(w.db.overrides).toEqual([]);
  });
});

describe('ShopProductSuppliersService — produits par fournisseur', () => {
  it('compte les produits de chaque fournisseur, dans ce club seulement', async () => {
    const w = makeWorld({
      products: [produit('sup-a'), produit('sup-a', 'p-2')],
      offers: [
        offre('sup-a'),
        offre('sup-b'),
        offre('sup-a', { id: 'off-2', productId: 'p-2' }),
        offre('sup-a', { id: 'off-x', clubId: 'club-2', productId: 'p-x' }),
      ],
    });

    const counts = await w.svc.productCountsBySupplier(CLUB);

    expect([...counts].sort((a, b) => a.supplierId.localeCompare(b.supplierId))).toEqual([
      { supplierId: 'sup-a', productCount: 2 },
      { supplierId: 'sup-b', productCount: 1 },
    ]);
  });
});
