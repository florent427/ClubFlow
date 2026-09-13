import { describe, expect, it } from 'vitest';
import {
  availabilityChipSuffix,
  availabilityPill,
  canAddToCart,
  cartPreorderNotice,
  defaultVariantOf,
  preorderNotice,
} from './shop-availability';
import type { ViewerShopAvailability } from './shop-documents';

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
  it('préfère une taille en stock, puis une commandable, puis la première', () => {
    expect(
      defaultVariantOf([v('a', 'SOLD_OUT'), v('b', 'PREORDER'), v('c', 'IN_STOCK')])?.id,
    ).toBe('c');
    expect(defaultVariantOf([v('a', 'SOLD_OUT'), v('b', 'PREORDER')])?.id).toBe('b');
    expect(defaultVariantOf([v('a', 'SOLD_OUT')])?.id).toBe('a');
    expect(defaultVariantOf([])).toBeNull();
  });
});

describe('availabilityPill et availabilityChipSuffix', () => {
  it('trois états distincts, jamais un chiffre', () => {
    expect(availabilityPill('IN_STOCK')).toMatchObject({ label: 'Disponible', tone: 'success' });
    expect(availabilityPill('PREORDER')).toMatchObject({ label: 'Sur commande', tone: 'warning' });
    expect(availabilityPill('SOLD_OUT')).toMatchObject({ label: 'Épuisé', tone: 'neutral' });
    expect(availabilityChipSuffix('IN_STOCK')).toBe('');
    expect(availabilityChipSuffix('PREORDER')).toBe(' · sur commande');
    expect(availabilityChipSuffix('SOLD_OUT')).toBe(' · épuisé');
  });
});

describe('preorderNotice et cartPreorderNotice', () => {
  it('cite le délai indicatif quand le club l’a donné', () => {
    expect(preorderNotice('3 à 4 semaines')).toContain('délai indicatif : 3 à 4 semaines');
    expect(preorderNotice(null)).not.toContain('délai');
  });

  it('rien à dire sans article sur commande, ni pour un article retiré de la vente', () => {
    expect(cartPreorderNotice([ligne({ availability: 'IN_STOCK' })])).toBeNull();
    expect(cartPreorderNotice([ligne({ unavailable: true })])).toBeNull();
  });

  it('le délai n’est cité que s’il vaut pour tous les articles sur commande', () => {
    expect(cartPreorderNotice([ligne()])).toContain('(délai indicatif : 3 semaines)');
    const melange = cartPreorderNotice([ligne(), ligne({ preorderLeadTime: null })]);
    expect(melange).toContain('Des articles de votre panier sont sur commande');
    expect(melange).not.toContain('délai');
  });
});
