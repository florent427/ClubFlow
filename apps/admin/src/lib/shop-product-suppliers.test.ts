import { describe, expect, it } from 'vitest';
import {
  effectiveTerms,
  linkableSuppliers,
  offerDraftFrom,
  planOffer,
  planOverrides,
  preferredOffer,
} from './shop-product-suppliers';
import type { ShopProductSupplierOffer, ShopSupplier } from './types';

function offre(over: Partial<ShopProductSupplierOffer> = {}): ShopProductSupplierOffer {
  return {
    id: 'off-a',
    supplierId: 'sup-a',
    supplierName: 'Textiles Pro',
    supplierActive: true,
    supplierRef: 'TS-100',
    unitCostCents: 850,
    packSize: 10,
    preferred: true,
    variantOverrides: [],
    ...over,
  };
}

function fournisseur(id: string, active = true): ShopSupplier {
  return {
    id,
    name: id,
    contactName: null,
    email: null,
    phone: null,
    accountRef: null,
    leadTimeDays: null,
    notes: null,
    active,
    createdAt: '2026-09-14T00:00:00.000Z',
  };
}

describe('preferredOffer', () => {
  it('rend le fournisseur choisi, ou null s’il n’y en a pas', () => {
    const choisi = offre();
    expect(
      preferredOffer({ suppliers: [offre({ id: 'off-b', preferred: false }), choisi] }),
    ).toBe(choisi);
    expect(preferredOffer({ suppliers: [offre({ preferred: false })] })).toBeNull();
    expect(preferredOffer({ suppliers: null })).toBeNull();
  });
});

describe('effectiveTerms — l’exception, sinon l’offre', () => {
  it('une déclinaison sans exception hérite de la référence et du prix', () => {
    expect(effectiveTerms(offre(), 'v-1')).toEqual({
      supplierRef: 'TS-100',
      unitCostCents: 850,
      refInherited: true,
      costInherited: true,
    });
  });

  it('une exception de prix seule garde la référence de l’offre', () => {
    const o = offre({
      variantOverrides: [
        { id: 'x', variantId: 'v-xxl', supplierRef: null, unitCostCents: 990 },
      ],
    });
    expect(effectiveTerms(o, 'v-xxl')).toEqual({
      supplierRef: 'TS-100',
      unitCostCents: 990,
      refInherited: true,
      costInherited: false,
    });
  });
});

describe('linkableSuppliers', () => {
  it('écarte les fournisseurs déjà rattachés et les désactivés', () => {
    const tous = [fournisseur('sup-a'), fournisseur('sup-b'), fournisseur('sup-c', false)];
    expect(
      linkableSuppliers(tous, { suppliers: [offre()] }).map((s) => s.id),
    ).toEqual(['sup-b']);
  });
});

describe('planOffer', () => {
  it('un prix vidé part à null — inconnu —, jamais à 0', () => {
    const plan = planOffer({ supplierRef: '  TS-100 ', costEuros: '  ', packSizeStr: '10' });
    expect(plan).toEqual({
      ok: true,
      terms: { supplierRef: 'TS-100', unitCostCents: null, packSize: 10 },
    });
  });

  it('convertit le prix saisi en centimes', () => {
    const plan = planOffer({ supplierRef: '', costEuros: '8,50', packSizeStr: '1' });
    expect(plan).toEqual({
      ok: true,
      terms: { supplierRef: null, unitCostCents: 850, packSize: 1 },
    });
  });

  it('refuse un prix illisible et un colisage nul', () => {
    expect(planOffer({ supplierRef: '', costEuros: 'abc', packSizeStr: '1' }).ok).toBe(false);
    expect(planOffer({ supplierRef: '', costEuros: '', packSizeStr: '0' }).ok).toBe(false);
    expect(planOffer({ supplierRef: '', costEuros: '', packSizeStr: '' }).ok).toBe(false);
  });

  it('le formulaire d’une offre existante repart de ses valeurs', () => {
    expect(offerDraftFrom(offre({ unitCostCents: null }))).toEqual({
      supplierRef: 'TS-100',
      costEuros: '',
      packSizeStr: '10',
    });
    expect(offerDraftFrom(null)).toEqual({ supplierRef: '', costEuros: '', packSizeStr: '1' });
  });
});

describe('planOverrides — seulement ce qui a changé', () => {
  const o = offre({
    variantOverrides: [
      { id: 'x', variantId: 'v-xxl', supplierRef: 'TS-100-XXL', unitCostCents: 990 },
    ],
  });
  const labels = { 'v-m': 'M', 'v-xxl': 'XXL' };

  it('une ligne intacte ne produit aucune écriture', () => {
    const plan = planOverrides({
      offer: o,
      variantIds: ['v-m', 'v-xxl'],
      rows: {
        'v-m': { supplierRef: '', costEuros: '' },
        'v-xxl': { supplierRef: 'TS-100-XXL', costEuros: '9,90' },
      },
      labels,
    });
    expect(plan).toEqual({ ok: true, steps: [] });
  });

  it('pose une exception, et vider les deux champs la supprime', () => {
    const plan = planOverrides({
      offer: o,
      variantIds: ['v-m', 'v-xxl'],
      rows: {
        'v-m': { supplierRef: '', costEuros: '9,20' },
        'v-xxl': { supplierRef: ' ', costEuros: '' },
      },
      labels,
    });
    expect(plan).toEqual({
      ok: true,
      steps: [
        { variantId: 'v-m', supplierRef: null, unitCostCents: 920 },
        { variantId: 'v-xxl', supplierRef: null, unitCostCents: null },
      ],
    });
  });

  it('un prix illisible bloque tout, avant la moindre écriture', () => {
    const plan = planOverrides({
      offer: o,
      variantIds: ['v-m', 'v-xxl'],
      rows: {
        'v-m': { supplierRef: 'TS-100-M', costEuros: '' },
        'v-xxl': { supplierRef: 'TS-100-XXL', costEuros: 'neuf' },
      },
      labels,
    });
    expect(plan).toEqual({ ok: false, error: 'Prix d’achat invalide sur « XXL »' });
  });
});
