import { describe, expect, it } from 'vitest';
import {
  canCheckoutShopCart,
  computeShopCartTotalCents,
  shopCartHasBlockingItems,
  shopCartItemCount,
  shopTermsGate,
} from './shop-cart';
import type { ShopCartItem } from './shop-documents';

/**
 * Ces tests ferment la logique pure du panier boutique. Le point sensible
 * (ADR-0012) : rien ici ne connaît une quantité de stock. On ne teste que des
 * booléens et des montants — jamais « il en reste 2 ».
 */

function item(over: Partial<ShopCartItem> = {}): ShopCartItem {
  return {
    id: 'i1',
    variantId: 'v1',
    productId: 'p1',
    label: 'T-shirt · L',
    imageUrl: null,
    quantity: 1,
    unitPriceCents: 1500,
    lineTotalCents: 1500,
    inStock: true,
    availability: 'IN_STOCK',
    preorderLeadTime: null,
    unavailable: false,
    ...over,
  };
}

describe('shopCartItemCount', () => {
  it('somme les quantités de toutes les lignes', () => {
    const cart = {
      items: [item({ quantity: 2 }), item({ id: 'i2', quantity: 3 })],
    };
    expect(shopCartItemCount(cart)).toBe(5);
  });

  it('vaut 0 pour un panier nul ou vide', () => {
    expect(shopCartItemCount(null)).toBe(0);
    expect(shopCartItemCount(undefined)).toBe(0);
    expect(shopCartItemCount({ items: [] })).toBe(0);
  });
});

describe('computeShopCartTotalCents', () => {
  it('additionne les lineTotalCents', () => {
    expect(
      computeShopCartTotalCents([
        item({ lineTotalCents: 1500 }),
        item({ id: 'i2', lineTotalCents: 2500 }),
      ]),
    ).toBe(4000);
  });

  it('vaut 0 pour un panier vide', () => {
    expect(computeShopCartTotalCents([])).toBe(0);
  });
});

describe('shopCartHasBlockingItems', () => {
  it('détecte une ligne épuisée et non commandable', () => {
    expect(
      shopCartHasBlockingItems([
        item({ inStock: false, availability: 'SOLD_OUT' }),
      ]),
    ).toBe(true);
  });

  it('une ligne sur commande ne bloque pas : elle sera remise à l’arrivage (ADR-0018)', () => {
    expect(
      shopCartHasBlockingItems([
        item({ inStock: false, availability: 'PREORDER' }),
      ]),
    ).toBe(false);
  });

  it('détecte une ligne devenue indisponible', () => {
    expect(shopCartHasBlockingItems([item({ unavailable: true })])).toBe(true);
  });

  it('est faux quand tout est disponible', () => {
    expect(
      shopCartHasBlockingItems([item(), item({ id: 'i2' })]),
    ).toBe(false);
  });
});

describe('canCheckoutShopCart', () => {
  it('autorise le checkout dès une ligne présente, même épuisée (le serveur arbitre)', () => {
    // Volontaire : on ne bloque pas côté client sur une rupture, sinon le
    // motif de refus du serveur ne s'afficherait jamais.
    expect(canCheckoutShopCart({ items: [item({ inStock: false })] })).toBe(
      true,
    );
  });

  it('refuse un panier vide ou absent', () => {
    expect(canCheckoutShopCart({ items: [] })).toBe(false);
    expect(canCheckoutShopCart(null)).toBe(false);
    expect(canCheckoutShopCart(undefined)).toBe(false);
  });
});

describe('shopTermsGate — les CGV devant les boutons de commande (ADR-0017)', () => {
  const CGV = { id: 'cgv-v2' };
  const base = { loading: false, terms: null, accepted: false };

  it('club sans CGV : on commande comme avant, sans rien envoyer', () => {
    expect(shopTermsGate(base)).toEqual({ blocked: false, acceptedTermsId: null });
  });

  it('CGV en ligne, case non cochée : bloqué', () => {
    expect(shopTermsGate({ ...base, terms: CGV })).toEqual({
      blocked: true,
      acceptedTermsId: null,
    });
  });

  it('case cochée : débloqué, et c’est la version AFFICHÉE qui part', () => {
    expect(shopTermsGate({ ...base, terms: CGV, accepted: true })).toEqual({
      blocked: false,
      acceptedTermsId: 'cgv-v2',
    });
  });

  it('tant que la requête n’a rien rendu : bloqué, le serveur refuserait', () => {
    expect(shopTermsGate({ ...base, loading: true })).toEqual({
      blocked: true,
      acceptedTermsId: null,
    });
  });
});
