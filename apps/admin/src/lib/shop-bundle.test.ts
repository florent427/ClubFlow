import { describe, expect, it } from 'vitest';
import {
  bundlePieceOptions,
  bundleSummary,
  planBundle,
  seedBundleRows,
} from './shop-bundle';
import { planMatrixSave, seedRow } from './shop-variant-matrix';
import type { ShopProduct, ShopProductVariant } from './types';

function variant(over: Partial<ShopProductVariant> = {}): ShopProductVariant {
  return {
    id: 'v1',
    productId: 'p1',
    isDefault: false,
    label: 'Rouge',
    sku: null,
    unitPriceCents: 4500,
    trackStock: true,
    available: 4,
    onHand: 4,
    reorderThreshold: null,
    onOrder: null,
    preorderedQty: null,
    avgCostCents: null,
    marginCents: null,
    marginRate: null,
    inStock: true,
    availability: 'IN_STOCK',
    belowThreshold: false,
    active: true,
    isBundle: false,
    bundleComponents: [],
    ...over,
  };
}

function product(id: string, name: string, variants: ShopProductVariant[]): ShopProduct {
  return {
    id,
    name,
    hasVariants: variants.some((v) => !v.isDefault),
    variants,
  } as ShopProduct;
}

describe('bundlePieceOptions', () => {
  const gants = product('p-gants', 'Gants', [
    variant({ id: 'g-def', productId: 'p-gants', isDefault: true, label: null }),
    variant({ id: 'g-rouge', productId: 'p-gants', label: 'Rouge' }),
    variant({ id: 'g-bleu', productId: 'p-gants', label: 'Bleu', trackStock: false }),
  ]);
  const ceinture = product('p-ceinture', 'Ceinture', [
    variant({ id: 'c-def', productId: 'p-ceinture', isDefault: true, label: null }),
  ]);
  const pack = product('p-pack', 'Pack complet', [
    variant({ id: 'k-1', productId: 'p-pack', isBundle: true, trackStock: true }),
  ]);
  const autrePack = product('p-pack2', 'Pack poings', [
    variant({ id: 'k-2', productId: 'p-pack2', isDefault: true, label: null, isBundle: true }),
  ]);

  it('propose les déclinaisons stockées des autres produits, triées', () => {
    expect(bundlePieceOptions([pack, gants, ceinture, autrePack], 'p-pack')).toEqual([
      { variantId: 'c-def', label: 'Ceinture' },
      { variantId: 'g-rouge', label: 'Gants — Rouge' },
    ]);
  });

  it('écarte le pack lui-même, les packs, les non suivies et le défaut caché', () => {
    const ids = bundlePieceOptions([pack, gants, autrePack], 'p-pack').map((o) => o.variantId);
    expect(ids).not.toContain('k-1');
    expect(ids).not.toContain('k-2');
    expect(ids).not.toContain('g-bleu');
    expect(ids).not.toContain('g-def');
  });
});

describe('planBundle', () => {
  it('ignore les lignes sans pièce et convertit les quantités', () => {
    expect(
      planBundle([
        { componentVariantId: 'a', quantityStr: '1' },
        { componentVariantId: '', quantityStr: '3' },
        { componentVariantId: 'b', quantityStr: ' 2 ' },
      ]),
    ).toEqual({
      ok: true,
      components: [
        { componentVariantId: 'a', quantity: 1 },
        { componentVariantId: 'b', quantity: 2 },
      ],
    });
  });

  it('refuse une quantité hors bornes ou décimale', () => {
    for (const q of ['0', '100', '1,5', '', 'x']) {
      expect(planBundle([{ componentVariantId: 'a', quantityStr: q }]).ok).toBe(false);
    }
  });

  it('refuse une pièce en double, et une composition vide', () => {
    expect(
      planBundle([
        { componentVariantId: 'a', quantityStr: '1' },
        { componentVariantId: 'a', quantityStr: '1' },
      ]),
    ).toMatchObject({ ok: false, error: expect.stringContaining('deux fois') });
    expect(planBundle([{ componentVariantId: '', quantityStr: '1' }]).ok).toBe(false);
  });
});

describe('composition enregistrée', () => {
  const v = variant({
    isBundle: true,
    bundleComponents: [
      { componentVariantId: 'g', quantity: 1, label: 'Gants — Rouge' },
      { componentVariantId: 'p', quantity: 2, label: 'Protège-pieds — Rouge / M' },
    ],
  });

  it('se résume et se resème à l’identique', () => {
    expect(bundleSummary(v)).toBe('1 × Gants — Rouge, 2 × Protège-pieds — Rouge / M');
    expect(seedBundleRows(v)).toEqual([
      { componentVariantId: 'g', quantityStr: '1' },
      { componentVariantId: 'p', quantityStr: '2' },
    ]);
  });
});

describe('planMatrixSave — un pack (ADR-0024)', () => {
  it('n’envoie ni suivi, ni seuil, ni inventaire pour un pack, mais ses autres champs', () => {
    const pack = variant({ id: 'k', isBundle: true, trackStock: true, onHand: 3, available: 3 });
    const plan = planMatrixSave({
      variants: [pack],
      rows: {
        k: { ...seedRow(pack), countedStr: '9', thresholdStr: '2', sku: 'PACK-R' },
      },
      tracked: false,
    });
    expect(plan).toEqual({
      ok: true,
      steps: [{ variantId: 'k', update: { sku: 'PACK-R' }, countedOnHand: null }],
    });
  });
});
