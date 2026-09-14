import { describe, expect, it } from 'vitest';
import {
  groupPreview,
  parseQty,
  planRestockOrders,
  refreshPreview,
  seedPreview,
  switchSupplier,
} from './shop-restock';
import type { ShopRestockLine, ShopRestockOffer, ShopRestockPlan } from './types';

function offre(over: Partial<ShopRestockOffer> = {}): ShopRestockOffer {
  return {
    supplierId: 'sup-a',
    supplierName: 'Textiles Pro',
    supplierActive: true,
    supplierRef: 'TS-100',
    unitCostCents: 850,
    packSize: 10,
    suggestedQty: 20,
    ...over,
  };
}

function ligne(over: Partial<ShopRestockLine> = {}): ShopRestockLine {
  const offers = over.offers ?? [offre()];
  return {
    variantId: 'v-m',
    productId: 'p-1',
    productName: 'T-shirt',
    label: 'M',
    sku: null,
    available: 2,
    onHand: 2,
    reorderThreshold: 5,
    reorderTargetQty: 20,
    alertedAt: null,
    onOrder: 0,
    preordered: 0,
    inDraft: 0,
    target: 20,
    shortfall: 18,
    suggestedQty: 20,
    supplier: offers[0],
    offers,
    ...over,
  };
}

function plan(over: Partial<ShopRestockPlan> = {}): ShopRestockPlan {
  return { groups: [], withoutSupplier: [], inactiveSupplier: [], covered: [], ...over };
}

describe('seedPreview', () => {
  it('reprend le fournisseur choisi actif et sa quantité proposée ; sinon la ligne part vide', () => {
    const desactive = offre({ supplierActive: false, suggestedQty: 20 });
    const preview = seedPreview(
      plan({
        groups: [{ supplierId: 'sup-a', supplierName: 'Textiles Pro', lines: [ligne()] }],
        withoutSupplier: [ligne({ variantId: 'v-sans', supplier: null })],
        inactiveSupplier: [ligne({ variantId: 'v-inactif', supplier: desactive, offers: [desactive] })],
        covered: [ligne({ variantId: 'v-couvert', shortfall: 0, suggestedQty: 0 })],
      }),
    );

    expect(preview.map((p) => [p.line.variantId, p.supplierId, p.qtyStr])).toEqual([
      ['v-m', 'sup-a', '20'],
      ['v-sans', null, ''],
      ['v-inactif', null, ''],
    ]);
  });
});

describe('refreshPreview', () => {
  it('le produit retouché repart du plan, les autres lignes gardent la saisie', () => {
    const avant = [
      { line: ligne({ variantId: 'v-ts', productId: 'p-ts' }), supplierId: 'sup-a', qtyStr: '30' },
      { line: ligne({ variantId: 'v-sac', productId: 'p-sac', supplier: null }), supplierId: null, qtyStr: '' },
    ];
    const relu = plan({
      groups: [
        {
          supplierId: 'sup-a',
          supplierName: 'Textiles Pro',
          lines: [
            ligne({ variantId: 'v-ts', productId: 'p-ts', shortfall: 17 }),
            ligne({ variantId: 'v-sac', productId: 'p-sac' }),
          ],
        },
      ],
    });

    const apres = refreshPreview(avant, relu, 'p-sac');

    expect(apres.map((p) => [p.line.variantId, p.supplierId, p.qtyStr, p.line.shortfall])).toEqual([
      ['v-ts', 'sup-a', '30', 17],
      ['v-sac', 'sup-a', '20', 18],
    ]);
  });
});

describe('switchSupplier', () => {
  const b = offre({ supplierId: 'sup-b', supplierName: 'Sport Import', packSize: 6, suggestedQty: 18 });
  const base = { line: ligne({ offers: [offre(), b] }), supplierId: 'sup-a', qtyStr: '20' };

  it('reprend la quantité proposée pour CE fournisseur', () => {
    expect(switchSupplier(base, 'sup-b')).toEqual({ ...base, supplierId: 'sup-b', qtyStr: '18' });
  });

  it('ignore un fournisseur désactivé ou étranger au produit, et null retire la ligne', () => {
    const inactif = { ...base, line: ligne({ offers: [offre(), { ...b, supplierActive: false }] }) };
    expect(switchSupplier(inactif, 'sup-b')).toBe(inactif);
    expect(switchSupplier(base, 'sup-z')).toBe(base);
    expect(switchSupplier(base, null)).toEqual({ ...base, supplierId: null, qtyStr: '' });
  });
});

describe('groupPreview', () => {
  it('regroupe par fournisseur retenu, totalise au prix connu et compte les prix inconnus', () => {
    const inconnu = offre({ supplierId: 'sup-b', supplierName: 'Adidas Club', unitCostCents: null });
    const { groups, unassigned } = groupPreview([
      { line: ligne({ variantId: 'v-1' }), supplierId: 'sup-a', qtyStr: '20' },
      { line: ligne({ variantId: 'v-2' }), supplierId: 'sup-a', qtyStr: '10' },
      { line: ligne({ variantId: 'v-3', offers: [inconnu] }), supplierId: 'sup-b', qtyStr: '4' },
      // Quantité vide : rien n’est commandé, donc aucun prix inconnu à signaler.
      { line: ligne({ variantId: 'v-5', offers: [inconnu] }), supplierId: 'sup-b', qtyStr: '' },
      { line: ligne({ variantId: 'v-4' }), supplierId: null, qtyStr: '' },
    ]);

    expect(
      groups.map((g) => [g.supplierName, g.lines.length, g.knownTotalCents, g.unknownCostLines]),
    ).toEqual([
      ['Adidas Club', 2, 0, 1],
      ['Textiles Pro', 2, 30 * 850, 0],
    ]);
    expect(unassigned.map((p) => p.line.variantId)).toEqual(['v-4']);
  });
});

describe('parseQty et planRestockOrders', () => {
  it('vide vaut zéro, un nombre non entier ou négatif est illisible', () => {
    expect(parseQty(' ')).toBe(0);
    expect(parseQty('12')).toBe(12);
    expect(parseQty('1,5')).toBeNull();
    expect(parseQty('1.5')).toBeNull();
    expect(parseQty('-2')).toBeNull();
  });

  it('envoie les lignes à quantité positive, et saute les quantités vides', () => {
    const res = planRestockOrders([
      { line: ligne({ variantId: 'v-1' }), supplierId: 'sup-a', qtyStr: '20' },
      { line: ligne({ variantId: 'v-2' }), supplierId: 'sup-a', qtyStr: '' },
      { line: ligne({ variantId: 'v-3' }), supplierId: null, qtyStr: '0' },
    ]);

    expect(res).toEqual({ ok: true, lines: [{ variantId: 'v-1', supplierId: 'sup-a', qty: 20 }] });
  });

  it('une quantité sans fournisseur, ou illisible, bloque tout', () => {
    expect(
      planRestockOrders([
        { line: ligne({ variantId: 'v-1' }), supplierId: 'sup-a', qtyStr: '20' },
        { line: ligne({ variantId: 'v-2', label: 'XXL' }), supplierId: null, qtyStr: '5' },
      ]),
    ).toEqual({
      ok: false,
      error: 'Choisissez un fournisseur pour « T-shirt — XXL », ou videz sa quantité',
    });
    expect(
      planRestockOrders([{ line: ligne({ label: null }), supplierId: 'sup-a', qtyStr: 'dix' }]),
    ).toEqual({ ok: false, error: 'Quantité invalide sur « T-shirt »' });
  });

  it('rien à commander : une erreur plutôt qu’un appel vide', () => {
    expect(planRestockOrders([{ line: ligne(), supplierId: 'sup-a', qtyStr: '' }])).toEqual({
      ok: false,
      error: 'Rien à commander : toutes les quantités sont vides.',
    });
  });
});
