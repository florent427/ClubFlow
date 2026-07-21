import { describe, expect, it } from 'vitest';
import {
  canCheckoutShopCart,
  computeShopCartTotalCents,
  shopCartHasBlockingItems,
  shopCartItemCount,
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
  it('détecte une ligne épuisée (inStock=false)', () => {
    expect(shopCartHasBlockingItems([item({ inStock: false })])).toBe(true);
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
