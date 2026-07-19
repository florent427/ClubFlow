import { NotFoundException } from '@nestjs/common';
import { PublicSiteService } from './public-site.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopService } from '../shop/shop.service';

/**
 * La vitrine est le SEUL écran de la boutique servi hors de tout guard, à des
 * visiteurs non authentifiés.
 *
 * Ces tests ne vérifient pas que la projection « ressemble » à quelque chose :
 * ils lui font traverser un amont VOLONTAIREMENT bavard — un produit portant
 * quantités, seuils et déclinaisons — et exigent qu'aucune de ces clés ne
 * ressorte, à quelque profondeur que ce soit. Un test qui listerait les champs
 * attendus resterait vert le jour où une quantité s'ajoute à côté d'eux
 * (cf. pitfalls/test-verifie-la-forme-pas-le-comportement.md).
 */

/** Ce qu'un visiteur ne doit jamais recevoir, où que ce soit dans la réponse. */
const CLES_INTERDITES = [
  'stock',
  'available',
  'onHand',
  'reorderThreshold',
  'reorderTargetQty',
  'variantsBelowThreshold',
  'belowThreshold',
  'lowStockAlertedAt',
  'trackStock',
];

/** Parcourt récursivement la réponse et remonte toute clé interdite trouvée. */
function clesInterditesTrouvees(value: unknown, chemin = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => clesInterditesTrouvees(v, `${chemin}[${i}]`));
  }
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
    const ici = chemin ? `${chemin}.${key}` : key;
    if (CLES_INTERDITES.includes(key)) found.push(ici);
    found.push(...clesInterditesTrouvees(sub, ici));
  }
  return found;
}

/**
 * Produit tel que `ShopService.listProductsPublic` le rend : déjà privé des
 * quantités par `withQuantities: false`, mais portant encore le `stock` dérivé
 * et le décompte de déclinaisons sous seuil. C'est exactement le cas où une
 * projection paresseuse (`return produits`) laisserait fuiter.
 */
function produitPublic(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    clubId: 'club-1',
    sku: 'MAILLOT',
    name: 'Maillot',
    description: 'Maillot officiel',
    imageUrl: 'https://exemple/maillot.png',
    priceCents: 4500,
    stock: 12,
    hasVariants: true,
    priceFromCents: 4000,
    variantsBelowThreshold: 3,
    variants: [
      {
        id: 'v-1',
        productId: 'p-1',
        isDefault: false,
        label: 'L',
        sku: null,
        unitPriceCents: 4500,
        trackStock: true,
        available: null,
        onHand: null,
        reorderThreshold: null,
        inStock: true,
        belowThreshold: false,
        active: true,
      },
    ],
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  };
}

function makeHarness(produits: Array<Record<string, unknown>>) {
  const prisma = {
    club: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.slug === 'sksr' ? { id: 'club-1', slug: 'sksr' } : null,
      ),
    },
    // Toute lecture directe de la table boutique est un échec de conception :
    // elle replacerait la vitrine hors du module et de sa projection publique.
    shopProduct: {
      findMany: jest.fn(async () => {
        throw new Error(
          'La vitrine ne doit pas lire shopProduct directement (ADR-0012).',
        );
      }),
    },
  };
  const shop = {
    listProductsPublic: jest.fn(async () => produits),
  };
  const service = new PublicSiteService(
    prisma as unknown as PrismaService,
    shop as unknown as ShopService,
  );
  return { service, prisma, shop };
}

describe('PublicSiteService.listShopProducts', () => {
  it('ne laisse fuiter aucune quantité ni seuil, à aucune profondeur', async () => {
    const { service } = makeHarness([produitPublic()]);

    const rows = await service.listShopProducts('sksr');

    expect(clesInterditesTrouvees(rows)).toEqual([]);
  });

  it("n'expose que les champs de présentation attendus", async () => {
    const { service } = makeHarness([produitPublic()]);

    const rows = await service.listShopProducts('sksr');

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([
      'description',
      'id',
      'imageUrl',
      'name',
      'priceCents',
    ]);
  });

  it('passe par la projection publique du module boutique, pas par la table', async () => {
    const { service, shop, prisma } = makeHarness([produitPublic()]);

    await service.listShopProducts('sksr');

    expect(shop.listProductsPublic).toHaveBeenCalledWith('club-1');
    expect(prisma.shopProduct.findMany).not.toHaveBeenCalled();
  });

  it('conserve le tri alphabétique attendu par la vitrine', async () => {
    const { service } = makeHarness([
      produitPublic({ id: 'p-2', name: 'Écharpe' }),
      produitPublic({ id: 'p-3', name: 'Bonnet' }),
      produitPublic({ id: 'p-1', name: 'Maillot' }),
    ]);

    const rows = await service.listShopProducts('sksr');

    expect(rows.map((r) => r.name)).toEqual(['Bonnet', 'Écharpe', 'Maillot']);
  });

  it('annonce le prix de base du produit, pas le minimum des déclinaisons', async () => {
    // La vitrine n'affiche pas « à partir de » : lui servir `priceFromCents`
    // changerait silencieusement le prix annoncé au visiteur.
    const { service } = makeHarness([
      produitPublic({ priceCents: 4500, priceFromCents: 4000 }),
    ]);

    const rows = await service.listShopProducts('sksr');

    expect(rows[0].priceCents).toBe(4500);
  });

  it('refuse un slug de club inconnu', async () => {
    const { service, shop } = makeHarness([produitPublic()]);

    await expect(service.listShopProducts('inconnu')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(shop.listProductsPublic).not.toHaveBeenCalled();
  });
});
