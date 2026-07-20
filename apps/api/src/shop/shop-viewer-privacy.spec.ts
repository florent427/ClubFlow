import { ShopService } from './shop.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import type { ShopStockService } from './shop-stock.service';

/**
 * Ce que le PORTAIL MEMBRE a le droit de voir.
 *
 * La vitrine publique avait ce test, le portail non — et c'est exactement par
 * là que la fuite est passée : `shapeProduct` neutralisait `available`,
 * `onHand` et `reorderThreshold` un par un, mais laissait intacts les champs
 * DÉRIVÉS de ces mêmes quantités. Un adhérent muni de son JWT pouvait lire
 * `viewerShopProducts { stock }` et connaître le stock exact du club.
 *
 * Le test balaie la réponse RÉCURSIVEMENT à la recherche de tout ce qui
 * trahit une quantité, plutôt que d'énumérer les champs attendus : une
 * liste blanche laisserait passer le prochain champ dérivé qu'on ajoutera.
 */

const INTERDITS = [
  'available',
  'onHand',
  'reorderThreshold',
  'reorderTargetQty',
  'stock',
  'variantsBelowThreshold',
  'belowThreshold',
  'lowStockAlertedAt',
  // ADR-0013 §4 : « 20 arrivent » est une quantité comme une autre, et
  // l'encours d'achat trahit en plus la politique de réappro du club.
  'onOrder',
];

/** Remonte tout chemin portant une valeur numérique ou vraie sur une clé interdite. */
function fuites(node: unknown, chemin = ''): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((n, i) => fuites(n, `${chemin}[${i}]`));
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => {
      const ici = chemin ? `${chemin}.${k}` : k;
      // null et false ne trahissent rien : c'est précisément l'état voulu.
      if (INTERDITS.includes(k) && v !== null && v !== false && v !== 0) {
        return [`${ici} = ${JSON.stringify(v)}`];
      }
      return fuites(v, ici);
    });
  }
  return [];
}

function makeSvc() {
  const produit = {
    id: 'p-1',
    clubId: 'club-1',
    sku: 'TSH',
    name: 'T-shirt du club',
    description: null,
    imageUrl: null,
    priceCents: 1800,
    stock: null,
    active: true,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    variants: [
      {
        id: 'v-1',
        clubId: 'club-1',
        productId: 'p-1',
        optionSignature: 'a|b',
        isDefault: false,
        label: 'L / Rouge',
        sku: 'TSH-L-R',
        priceCents: null,
        trackStock: true,
        onHand: 12,
        available: 2,
        reorderThreshold: 5,
        reorderTargetQty: 20,
        lowStockAlertedAt: null,
        active: true,
        createdAt: new Date('2026-07-01'),
        updatedAt: new Date('2026-07-01'),
      },
    ],
  };

  const prisma = {
    shopProduct: { findMany: jest.fn().mockResolvedValue([produit]) },
  };
  // Le double d'approvisionnement renvoie un encours NON NUL : un stub à zéro
  // rendrait le test de fuite vert quoi qu'il arrive, puisque `0` ne trahit
  // rien. C'est exactement le défaut décrit par
  // pitfalls/test-verifie-la-forme-pas-le-comportement.md.
  const purchases = {
    onOrderByVariant: jest.fn().mockResolvedValue(new Map([['v-1', 20]])),
  };
  const svc = new ShopService(
    prisma as unknown as PrismaService,
    {} as unknown as ShopStockService,
    purchases as unknown as ShopPurchaseOrdersService,
  );
  return { svc, produit, purchases };
}

describe('listProductsPublic — ce que voit un adhérent', () => {
  it('ne laisse fuiter AUCUNE quantité ni seuil, même dérivé', async () => {
    // Le produit du fixture est volontairement bavard : 12 en stock physique,
    // 2 vendables, seuil à 5 — donc sous le seuil. Si un seul de ces chiffres
    // ressort, le test le nomme.
    const { svc } = makeSvc();

    const rows = await svc.listProductsPublic('club-1');

    expect(fuites(rows)).toEqual([]);
  });

  it('donne quand même de quoi acheter : disponibilité et prix', async () => {
    // Le pendant indispensable du test précédent : tout mettre à null le
    // ferait passer aussi, et rendrait la boutique inutilisable.
    const { svc } = makeSvc();

    const [p] = await svc.listProductsPublic('club-1');

    expect(p.name).toBe('T-shirt du club');
    expect(p.priceFromCents).toBe(1800);
    expect(p.variants[0].inStock).toBe(true);
    expect(p.variants[0].label).toBe('L / Rouge');
    expect(p.variants[0].unitPriceCents).toBe(1800);
  });

  it('annonce une déclinaison ÉPUISÉE sans révéler qu’il en reste zéro ailleurs', async () => {
    const { svc, produit } = makeSvc();
    produit.variants[0].available = 0;

    const [p] = await svc.listProductsPublic('club-1');

    expect(p.variants[0].inStock).toBe(false);
    expect(fuites([p])).toEqual([]);
  });
});

describe('listProductsAdmin — ce que voit le trésorier', () => {
  it('reçoit LUI les quantités : sans ça la matrice serait aveugle', async () => {
    const { svc } = makeSvc();

    const [p] = await svc.listProductsAdmin('club-1');

    expect(p.stock).toBe(2);
    expect(p.variants[0].available).toBe(2);
    expect(p.variants[0].onHand).toBe(12);
    expect(p.variants[0].reorderThreshold).toBe(5);
    expect(p.variants[0].belowThreshold).toBe(true);
    expect(p.variantsBelowThreshold).toBe(1);
  });

  it('voit l’encours fournisseur — « il reste 2, mais 20 arrivent »', async () => {
    // Le pendant du test de fuite : sans lui, neutraliser `onOrder` PARTOUT
    // passerait les deux, et l'admin recommanderait deux fois (ADR-0013 §4).
    const { svc } = makeSvc();

    const [p] = await svc.listProductsAdmin('club-1');

    expect(p.variants[0].onOrder).toBe(20);
  });

  it('n’interroge JAMAIS l’encours d’achat sur le chemin public', async () => {
    const { svc, purchases } = makeSvc();

    await svc.listProductsPublic('club-1');

    expect(purchases.onOrderByVariant).not.toHaveBeenCalled();
  });
});
