import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShopVariantsService, optionSignature } from './shop-variants.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopService } from './shop.service';
import type { ShopStockService } from './shop-stock.service';

/**
 * CRUD des déclinaisons — ADR-0012.
 *
 * Le double APPLIQUE les contraintes au lieu de laisser inspecter la forme des
 * requêtes. Deux d'entre elles portent tout le lot :
 *
 *  - `@@unique([productId, optionSignature])`, simulée par un vrai P2002 — sans
 *    quoi le test d'idempotence de la matrice ne prouverait rien ;
 *  - `onDelete: Restrict` sur ShopOrderLine → variant, simulée par un `delete`
 *    qui LÈVE — de sorte qu'une régression remplaçant la désactivation par une
 *    suppression rougit ici, et non en production chez le seul club qui a des
 *    commandes.
 */

type OptionRow = {
  id: string;
  clubId: string;
  productId: string;
  name: string;
  position: number;
};
type ValueRow = {
  id: string;
  clubId: string;
  optionId: string;
  value: string;
  position: number;
};
type VariantRow = {
  id: string;
  clubId: string;
  productId: string;
  optionSignature: string;
  isDefault: boolean;
  label: string | null;
  sku: string | null;
  priceCents: number | null;
  trackStock: boolean;
  onHand: number;
  available: number;
  reorderThreshold: number | null;
  reorderTargetQty: number | null;
  lowStockAlertedAt: Date | null;
  active: boolean;
};

const DEFAULT_VARIANT = (over: Partial<VariantRow> = {}): VariantRow => ({
  id: 'var-default',
  clubId: 'club-1',
  productId: 'p-1',
  optionSignature: '', // chaîne VIDE : c'est elle qui porte l'unicité
  isDefault: true,
  label: null,
  sku: null,
  priceCents: null,
  trackStock: true,
  onHand: 4,
  available: 4,
  reorderThreshold: null,
  reorderTargetQty: null,
  lowStockAlertedAt: null,
  active: true,
  ...over,
});

function makeHarness(seed: { variants?: VariantRow[] } = {}) {
  const options: OptionRow[] = [];
  const values: ValueRow[] = [];
  const variants: VariantRow[] = seed.variants ?? [DEFAULT_VARIANT()];
  const products = [{ id: 'p-1', clubId: 'club-1' }];

  const idIn = (where: any, id: string) =>
    where.id?.in !== undefined ? where.id.in.includes(id) : true;

  const matchVariant = (r: VariantRow, w: Record<string, any>): boolean => {
    if (w.id !== undefined && typeof w.id === 'string' && r.id !== w.id) return false;
    if (!idIn(w, r.id)) return false;
    if (w.clubId !== undefined && r.clubId !== w.clubId) return false;
    if (w.productId !== undefined && r.productId !== w.productId) return false;
    if (w.isDefault !== undefined && r.isDefault !== w.isDefault) return false;
    if (w.active !== undefined && r.active !== w.active) return false;
    return true;
  };

  const prisma = {
    // Rattaché après coup : le client de transaction EST le double lui-même,
    // ce qui ne peut pas s'écrire dans l'initialiseur sans auto-référence.
    $transaction: jest.fn(),

    shopProduct: {
      findFirst: jest.fn(async ({ where }: { where: any }) =>
        products.find((p) => p.id === where.id && p.clubId === where.clubId) ?? null,
      ),
    },

    shopProductOption: {
      findMany: jest.fn(async ({ where, include }: any) => {
        const hit = options.filter(
          (o) => o.clubId === where.clubId && o.productId === where.productId,
        );
        const sorted = [...hit].sort((a, b) => a.position - b.position);
        if (!include?.values) return sorted;
        return sorted.map((o) => ({
          ...o,
          values: values
            .filter((v) => v.optionId === o.id)
            .sort((a, b) => a.position - b.position),
        }));
      }),
      create: jest.fn(async ({ data }: any) => {
        // Identifiant déterministe : les signatures du test restent lisibles.
        const row: OptionRow = { id: `o:${data.productId}:${data.name}`, ...data };
        options.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = options.find((o) => o.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const gone = options.filter((o) => where.id.in.includes(o.id));
        gone.forEach((o) => {
          options.splice(options.indexOf(o), 1);
          // Cascade : les valeurs suivent leur axe.
          values
            .filter((v) => v.optionId === o.id)
            .forEach((v) => values.splice(values.indexOf(v), 1));
        });
        return { count: gone.length };
      }),
    },

    shopProductOptionValue: {
      create: jest.fn(async ({ data }: any) => {
        const row: ValueRow = { id: `v:${data.optionId}:${data.value}`, ...data };
        values.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = values.find((v) => v.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const gone = values.filter((v) => where.id.in.includes(v.id));
        gone.forEach((v) => values.splice(values.indexOf(v), 1));
        return { count: gone.length };
      }),
    },

    shopProductVariant: {
      findMany: jest.fn(async ({ where }: any) =>
        variants.filter((r) => matchVariant(r, where)).map((r) => ({ ...r })),
      ),
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = variants.find((r) => matchVariant(r, where));
        return hit ? { ...hit } : null;
      }),
      create: jest.fn(async ({ data }: any) => {
        // LA contrainte @@unique([productId, optionSignature]). Sans ce P2002,
        // le test d'idempotence resterait vert avec des doublons en base.
        const clash = variants.some(
          (v) =>
            v.productId === data.productId &&
            v.optionSignature === data.optionSignature,
        );
        if (clash) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            {
              code: 'P2002',
              clientVersion: 'test',
              meta: { target: ['productId', 'optionSignature'] },
            },
          );
        }
        const row: VariantRow = {
          id: `var:${data.optionSignature}`,
          lowStockAlertedAt: null,
          active: true,
          ...data,
        };
        variants.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((r) => matchVariant(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
      // `onDelete: Restrict` sur ShopOrderLine → variant : une déclinaison
      // déjà commandée ne PEUT pas disparaître. Toute tentative rougit.
      delete: jest.fn(async () => {
        throw new Error('FK Restrict : une déclinaison ne se supprime pas');
      }),
    },
  };

  prisma.$transaction.mockImplementation(((fn: (t: unknown) => Promise<unknown>) =>
    fn(prisma)) as never);

  const shop = {
    reloadProduct: jest.fn(async (_clubId: string, id: string) => ({ id })),
  };
  const stock = {
    restock: jest.fn(async () => undefined),
    adjust: jest.fn(async () => undefined),
    recordShrinkage: jest.fn(async () => undefined),
    listMovements: jest.fn(async () => []),
  };

  const svc = new ShopVariantsService(
    prisma as unknown as PrismaService,
    shop as unknown as ShopService,
    stock as unknown as ShopStockService,
  );
  return { svc, prisma, variants, options, values, shop, stock };
}

describe('optionSignature', () => {
  it('TRIE les identifiants : l’ordre de saisie ne change pas la combinaison', async () => {
    // Sans le tri, {rouge, L} et {L, rouge} produiraient deux signatures pour
    // la même combinaison, et le @@unique cesserait de mordre.
    expect(optionSignature(['b', 'a', 'c'])).toBe('a|b|c');
    expect(optionSignature(['c', 'a', 'b'])).toBe(optionSignature(['a', 'b', 'c']));
  });

  it('rend la chaîne VIDE pour la variante par défaut, jamais un NULL', async () => {
    // Un NULL laisserait cohabiter plusieurs « variantes par défaut » sur le
    // même produit : PostgreSQL traite les NULL comme distincts dans un index
    // unique. La chaîne vide, elle, est une valeur.
    expect(optionSignature([])).toBe('');
  });
});

describe('ShopVariantsService.setOptions — la variante par défaut', () => {
  it('DÉSACTIVE la variante par défaut à l’ajout d’axes, sans la supprimer', async () => {
    // Le cas limite du lot. La FK ShopOrderLine → variant est Restrict : la
    // supprimer casserait l'historique des commandes déjà passées.
    const h = makeHarness();

    await h.svc.setOptions('club-1', 'p-1', [
      { name: 'Taille', values: ['L', 'M'] },
    ]);

    const def = h.variants.find((v) => v.isDefault)!;
    expect(def).toBeDefined(); // toujours là
    expect(def.active).toBe(false); // mais retirée de la vente
    expect(h.prisma.shopProductVariant.delete).not.toHaveBeenCalled();
  });

  it('laisse la variante par défaut ACTIVE tant que le produit reste simple', async () => {
    // La régression à éviter absolument : désactiver tout un catalogue de
    // produits simples parce qu'aucune combinaison n'est « valide ».
    const h = makeHarness();

    await h.svc.setOptions('club-1', 'p-1', []);

    expect(h.variants.find((v) => v.isDefault)!.active).toBe(true);
  });

  it('désactive les déclinaisons dont une valeur d’axe a disparu', async () => {
    const h = makeHarness();
    await h.svc.setOptions('club-1', 'p-1', [
      { name: 'Taille', values: ['L', 'M'] },
    ]);
    await h.svc.generateVariants('club-1', 'p-1');
    const before = h.variants.filter((v) => !v.isDefault && v.active).length;
    expect(before).toBe(2);

    // « M » est retirée du catalogue.
    await h.svc.setOptions('club-1', 'p-1', [{ name: 'Taille', values: ['L'] }]);

    const active = h.variants.filter((v) => !v.isDefault && v.active);
    expect(active).toHaveLength(1);
    expect(active[0]!.label).toBe('L');
    // La déclinaison « M » existe toujours, seulement désactivée.
    expect(h.variants.filter((v) => v.label === 'M')).toHaveLength(1);
  });

  it('refuse deux axes homonymes — la combinaison serait ambiguë', async () => {
    const h = makeHarness();

    await expect(
      h.svc.setOptions('club-1', 'p-1', [
        { name: 'Taille', values: ['L'] },
        { name: 'Taille', values: ['M'] },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse un produit d’un AUTRE club', async () => {
    const h = makeHarness();

    await expect(
      h.svc.setOptions('club-2', 'p-1', [{ name: 'Taille', values: ['L'] }]),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ShopVariantsService.generateVariants — matrice', () => {
  it('produit le PRODUIT CARTÉSIEN des axes', async () => {
    const h = makeHarness();
    await h.svc.setOptions('club-1', 'p-1', [
      { name: 'Taille', values: ['L', 'M'] },
      { name: 'Couleur', values: ['Rouge', 'Bleu'] },
    ]);

    await h.svc.generateVariants('club-1', 'p-1');

    const generated = h.variants.filter((v) => !v.isDefault);
    expect(generated).toHaveLength(4);
    // Libellé dans l'ordre des AXES, lisible — la signature, elle, est triée.
    expect(generated.map((v) => v.label).sort()).toEqual([
      'L / Bleu',
      'L / Rouge',
      'M / Bleu',
      'M / Rouge',
    ]);
  });

  it('EST IDEMPOTENT : un second appel ne recrée rien', async () => {
    // L'idempotence n'est pas tenue par une lecture préalable mais par le
    // @@unique : le P2002 est un no-op attendu. Deux appels concurrents — un
    // double-clic suffit — passeraient tous deux la lecture.
    const h = makeHarness();
    await h.svc.setOptions('club-1', 'p-1', [
      { name: 'Taille', values: ['L', 'M', 'S'] },
    ]);

    await h.svc.generateVariants('club-1', 'p-1');
    const after1 = h.variants.length;
    await h.svc.generateVariants('club-1', 'p-1');

    expect(h.variants.length).toBe(after1);
    expect(h.variants.filter((v) => !v.isDefault)).toHaveLength(3);
  });

  it('n’engendre QUE les combinaisons manquantes après ajout d’une valeur', async () => {
    const h = makeHarness();
    await h.svc.setOptions('club-1', 'p-1', [{ name: 'Taille', values: ['L'] }]);
    await h.svc.generateVariants('club-1', 'p-1');
    const lId = h.variants.find((v) => v.label === 'L')!.id;

    await h.svc.setOptions('club-1', 'p-1', [
      { name: 'Taille', values: ['L', 'XL'] },
    ]);
    await h.svc.generateVariants('club-1', 'p-1');

    // La déclinaison « L » n'a pas été recréée : c'est le MÊME enregistrement,
    // donc son stock et son historique sont intacts.
    expect(h.variants.find((v) => v.label === 'L')!.id).toBe(lId);
    expect(h.variants.filter((v) => !v.isDefault)).toHaveLength(2);
  });

  it('HÉRITE du suivi de stock de la variante par défaut', async () => {
    // Un produit vendu en illimité dont la matrice naîtrait `trackStock: true`
    // à zéro unité serait entièrement invendable, sans que rien ne le signale.
    const h = makeHarness({
      variants: [DEFAULT_VARIANT({ trackStock: false, reorderThreshold: 7 })],
    });
    await h.svc.setOptions('club-1', 'p-1', [{ name: 'Taille', values: ['L'] }]);

    await h.svc.generateVariants('club-1', 'p-1');

    const generated = h.variants.find((v) => !v.isDefault)!;
    expect(generated.trackStock).toBe(false);
    expect(generated.reorderThreshold).toBe(7);
  });

  it('refuse d’engendrer une matrice sans aucun axe', async () => {
    const h = makeHarness();

    await expect(h.svc.generateVariants('club-1', 'p-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('ShopVariantsService.updateVariant', () => {
  it('RÉARME l’alerte au changement de seuil', async () => {
    // Sans cette remise à zéro, un seuil relevé de 2 à 10 sur une déclinaison
    // déjà alertée n'alerterait plus JAMAIS : le marqueur posé pour l'ancien
    // seuil masquerait tous les passages suivants.
    const h = makeHarness({
      variants: [
        DEFAULT_VARIANT({
          reorderThreshold: 2,
          lowStockAlertedAt: new Date('2026-07-01'),
        }),
      ],
    });

    await h.svc.updateVariant('club-1', 'var-default', { reorderThreshold: 10 });

    expect(h.variants[0]!.reorderThreshold).toBe(10);
    expect(h.variants[0]!.lowStockAlertedAt).toBeNull();
  });

  it('RÉARME aussi à la (re)prise en charge du suivi de stock', async () => {
    const h = makeHarness({
      variants: [
        DEFAULT_VARIANT({
          trackStock: false,
          lowStockAlertedAt: new Date('2026-07-01'),
        }),
      ],
    });

    await h.svc.updateVariant('club-1', 'var-default', { trackStock: true });

    expect(h.variants[0]!.lowStockAlertedAt).toBeNull();
  });

  it('NE réarme PAS sur un changement sans rapport', async () => {
    // Renommer une déclinaison ne doit pas relancer l'alerte : le club
    // recevrait un courrier à chaque retouche de libellé.
    const alerted = new Date('2026-07-01');
    const h = makeHarness({
      variants: [DEFAULT_VARIANT({ reorderThreshold: 2, lowStockAlertedAt: alerted })],
    });

    await h.svc.updateVariant('club-1', 'var-default', { label: 'Taille unique' });

    expect(h.variants[0]!.lowStockAlertedAt).toBe(alerted);
  });

  it('refuse une déclinaison d’un AUTRE club — la frontière est dans l’écriture', async () => {
    const h = makeHarness();

    await expect(
      h.svc.updateVariant('club-2', 'var-default', { active: false }),
    ).rejects.toThrow(BadRequestException);
    expect(h.variants[0]!.active).toBe(true);
  });

  it('n’écrit NI onHand NI available — le moteur reste seul maître du stock', async () => {
    const h = makeHarness();

    await h.svc.updateVariant('club-1', 'var-default', {
      // @ts-expect-error : le type interdit déjà ces champs ; on vérifie qu'un
      // appelant en JavaScript ne pourrait pas les faire passer non plus.
      available: 9999,
      label: 'Unique',
    });

    expect(h.variants[0]!.available).toBe(4);
    expect(h.variants[0]!.onHand).toBe(4);
  });
});

describe('ShopVariantsService — délégations au moteur de stock', () => {
  it('restock délègue sans rien recalculer', async () => {
    const h = makeHarness();

    await h.svc.restock('club-1', { variantId: 'var-default', qty: 12, reason: 'Livraison' });

    expect(h.stock.restock).toHaveBeenCalledWith({
      clubId: 'club-1',
      variantId: 'var-default',
      qty: 12,
      reason: 'Livraison',
    });
    // Aucun compteur touché ici : c'est le moteur, et lui seul, qui écrit.
    expect(h.prisma.shopProductVariant.updateMany).not.toHaveBeenCalled();
  });

  it('adjustStock et recordShrinkage délèguent aussi', async () => {
    const h = makeHarness();

    await h.svc.adjustStock('club-1', { variantId: 'var-default', countedOnHand: 3 });
    await h.svc.recordShrinkage('club-1', {
      variantId: 'var-default',
      qty: 1,
      reason: 'Casse',
    });

    expect(h.stock.adjust).toHaveBeenCalledWith(
      expect.objectContaining({ clubId: 'club-1', countedOnHand: 3 }),
    );
    expect(h.stock.recordShrinkage).toHaveBeenCalledWith(
      expect.objectContaining({ clubId: 'club-1', qty: 1, reason: 'Casse' }),
    );
  });
});
