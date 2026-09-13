import { describe, expect, it } from 'vitest';
import {
  availabilitySuffix,
  canAddToCart,
  cartPreorderNotice,
  defaultVariantOf,
  preorderNotice,
} from './shop-availability';
import type { ViewerShopAvailability } from './viewer-types';

const v = (id: string, availability: ViewerShopAvailability) => ({
  id,
  availability,
});

const ligne = (
  over: Partial<{
    availability: ViewerShopAvailability;
    preorderLeadTime: string | null;
    unavailable: boolean;
  }> = {},
) => ({
  availability: 'PREORDER' as ViewerShopAvailability,
  preorderLeadTime: '3 semaines' as string | null,
  unavailable: false,
  ...over,
});

describe('canAddToCart — précommande (ADR-0018)', () => {
  it('en stock ou sur commande : oui ; épuisé : non', () => {
    expect(canAddToCart('IN_STOCK')).toBe(true);
    expect(canAddToCart('PREORDER')).toBe(true);
    expect(canAddToCart('SOLD_OUT')).toBe(false);
  });
});

describe('defaultVariantOf', () => {
  it('préfère une taille en stock, même placée après une taille sur commande', () => {
    expect(
      defaultVariantOf([v('a', 'SOLD_OUT'), v('b', 'PREORDER'), v('c', 'IN_STOCK')])?.id,
    ).toBe('c');
  });

  it('sinon une taille commandable plutôt qu’une épuisée', () => {
    expect(defaultVariantOf([v('a', 'SOLD_OUT'), v('b', 'PREORDER')])?.id).toBe('b');
  });

  it('sinon la première, et rien sans déclinaison', () => {
    expect(defaultVariantOf([v('a', 'SOLD_OUT'), v('b', 'SOLD_OUT')])?.id).toBe('a');
    expect(defaultVariantOf([])).toBeNull();
  });
});

describe('availabilitySuffix et preorderNotice', () => {
  it('nomme la disponibilité dans le sélecteur', () => {
    expect(availabilitySuffix('IN_STOCK')).toBe('');
    expect(availabilitySuffix('PREORDER')).toBe(' — sur commande');
    expect(availabilitySuffix('SOLD_OUT')).toBe(' — épuisé');
  });

  it('cite le délai indicatif quand le club l’a donné', () => {
    expect(preorderNotice('3 à 4 semaines')).toContain(
      'délai indicatif : 3 à 4 semaines',
    );
    expect(preorderNotice(null)).not.toContain('délai');
  });
});

describe('cartPreorderNotice — le règlement prévient', () => {
  it('rien à dire sans article sur commande, ni pour un article retiré de la vente', () => {
    expect(cartPreorderNotice([ligne({ availability: 'IN_STOCK' })])).toBeNull();
    expect(cartPreorderNotice([ligne({ unavailable: true })])).toBeNull();
  });

  it('un article : singulier, délai compris', () => {
    const texte = cartPreorderNotice([ligne(), ligne({ availability: 'IN_STOCK' })]);

    expect(texte).toContain('Un article de votre panier est sur commande');
    expect(texte).toContain('(délai indicatif : 3 semaines)');
  });

  it('plusieurs articles : le délai n’est cité que s’il vaut pour tous', () => {
    expect(cartPreorderNotice([ligne(), ligne()])).toContain(
      '(délai indicatif : 3 semaines)',
    );
    const melange = cartPreorderNotice([
      ligne(),
      ligne({ preorderLeadTime: '2 mois' }),
    ]);
    expect(melange).toContain('Des articles de votre panier sont sur commande');
    expect(melange).not.toContain('délai');
  });
});
