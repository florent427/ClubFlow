import { describe, expect, it } from 'vitest';
import {
  canCheckout,
  computeCartTotalCents,
  countCartUnits,
  installmentsPreview,
  partitionCart,
} from './shop-cart';
import type { ViewerShopCartItem } from './viewer-types';

/** Fabrique une ligne de panier minimale, surchargée au besoin. */
function line(over: Partial<ViewerShopCartItem> = {}): ViewerShopCartItem {
  return {
    id: 'i1',
    variantId: 'v1',
    productId: 'p1',
    label: 'T-shirt — L',
    imageUrl: null,
    quantity: 1,
    unitPriceCents: 1500,
    lineTotalCents: 1500,
    inStock: true,
    unavailable: false,
    ...over,
  };
}

describe('partitionCart — sépare vendable et indisponible', () => {
  it('range chaque ligne selon `unavailable`, pas selon `inStock`', () => {
    // Une ligne épuisée (`inStock: false`) reste VENDABLE tant qu'elle n'est
    // pas `unavailable` : c'est le checkout serveur qui tranche la rupture,
    // pas cet écran. Seul `unavailable` (produit désactivé) l'écarte.
    const items = [
      line({ id: 'a' }),
      line({ id: 'b', inStock: false }),
      line({ id: 'c', unavailable: true }),
    ];
    const { available, unavailable } = partitionCart(items);
    expect(available.map((i) => i.id)).toEqual(['a', 'b']);
    expect(unavailable.map((i) => i.id)).toEqual(['c']);
  });
});

describe('computeCartTotalCents — exclut les lignes indisponibles', () => {
  it('somme uniquement les lignes vendables', () => {
    const items = [
      line({ lineTotalCents: 1500 }),
      line({ lineTotalCents: 3000 }),
      line({ lineTotalCents: 9999, unavailable: true }),
    ];
    expect(computeCartTotalCents(items)).toBe(4500);
  });

  it('vaut 0 pour un panier vide', () => {
    expect(computeCartTotalCents([])).toBe(0);
  });
});

describe('countCartUnits — additionne les quantités vendables', () => {
  it('ignore les lignes indisponibles', () => {
    const items = [
      line({ quantity: 2 }),
      line({ quantity: 3 }),
      line({ quantity: 5, unavailable: true }),
    ];
    expect(countCartUnits(items)).toBe(5);
  });
});

describe('canCheckout — au moins une ligne vendable', () => {
  it('faux sur panier vide', () => {
    expect(canCheckout([])).toBe(false);
  });
  it('faux si tout est indisponible', () => {
    expect(canCheckout([line({ unavailable: true })])).toBe(false);
  });
  it('vrai dès qu’une ligne est vendable, même épuisée', () => {
    expect(canCheckout([line({ inStock: false })])).toBe(true);
  });
});

describe('installmentsPreview — échéancier 3× fidèle à l’adhésion', () => {
  it('répartit l’arrondi sur la dernière échéance (250,00 €)', () => {
    // 25000 / 3 = 8333.33 → base 8333, dernière 25000 - 16666 = 8334.
    const p = installmentsPreview(25000);
    expect(p.base).toBe(8333);
    expect(p.last).toBe(8334);
    expect(p.equal).toBe(false);
    // Invariant fondamental : la somme des 3 échéances = le total exact.
    expect(p.base * 2 + p.last).toBe(25000);
  });

  it('trois échéances égales quand le total est divisible par 3', () => {
    const p = installmentsPreview(9000);
    expect(p).toEqual({ base: 3000, last: 3000, equal: true });
    expect(p.base * 2 + p.last).toBe(9000);
  });

  it('conserve l’invariant de somme sur un montant quelconque', () => {
    for (const total of [1, 100, 4999, 12345, 99999]) {
      const p = installmentsPreview(total);
      expect(p.base * 2 + p.last).toBe(total);
    }
  });
});
