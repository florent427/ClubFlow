import { ShopAvailability, availabilityOf } from './shop-availability.enum';

describe('availabilityOf — la règle unique de disponibilité (ADR-0018)', () => {
  it('stock non suivi : toujours en stock, même à zéro', () => {
    expect(availabilityOf({ trackStock: false, available: 0 }, false)).toBe(
      ShopAvailability.IN_STOCK,
    );
    expect(availabilityOf({ trackStock: false, available: 0 }, true)).toBe(
      ShopAvailability.IN_STOCK,
    );
  });

  it('en stock : en stock, que la précommande soit ouverte ou non', () => {
    expect(availabilityOf({ trackStock: true, available: 1 }, false)).toBe(
      ShopAvailability.IN_STOCK,
    );
    expect(availabilityOf({ trackStock: true, available: 1 }, true)).toBe(
      ShopAvailability.IN_STOCK,
    );
  });

  it('épuisé : sur commande si le club l’accepte, épuisé sinon', () => {
    expect(availabilityOf({ trackStock: true, available: 0 }, true)).toBe(
      ShopAvailability.PREORDER,
    );
    expect(availabilityOf({ trackStock: true, available: 0 }, false)).toBe(
      ShopAvailability.SOLD_OUT,
    );
  });
});
