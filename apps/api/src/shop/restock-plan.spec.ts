import {
  buildRestockPlan,
  effectiveTerms,
  restockTarget,
  roundUpToPack,
} from './restock-plan';
import type {
  RestockOfferTerms,
  RestockPlan,
  RestockVariantInput,
} from './restock-plan';

/**
 * Le plan de réapprovisionnement — ADR-0021 §3.
 *
 * besoin = max(0, cible + précommandes − vendable − encours − brouillons),
 * arrondi au colisage du fournisseur choisi. C'est la seule fonction qui décide
 * de ce que le club commande : chaque terme a un test qui rougit sans lui.
 */

function offre(over: Partial<RestockOfferTerms> = {}): RestockOfferTerms {
  return {
    supplierId: 'sup-a',
    supplierName: 'Textiles Pro',
    supplierActive: true,
    supplierRef: 'TS-100',
    unitCostCents: 850,
    packSize: 1,
    ...over,
  };
}

function declinaison(over: Partial<RestockVariantInput> = {}): RestockVariantInput {
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
    preferredSupplierId: 'sup-a',
    offers: [offre()],
    ...over,
  };
}

const aCommander = (plan: RestockPlan) => plan.groups.flatMap((g) => g.lines);

describe('restockTarget — la quantité visée', () => {
  it('la cible, à défaut une unité de plus que le seuil, à défaut rien', () => {
    expect(restockTarget({ reorderTargetQty: 20, reorderThreshold: 5 })).toBe(20);
    expect(restockTarget({ reorderTargetQty: null, reorderThreshold: 5 })).toBe(6);
    expect(restockTarget({ reorderTargetQty: null, reorderThreshold: null })).toBe(0);
  });
});

describe('roundUpToPack — on n’achète pas 7 t-shirts vendus par 10', () => {
  it('arrondit au multiple supérieur, et rien reste rien', () => {
    expect(roundUpToPack(7, 10)).toBe(10);
    expect(roundUpToPack(10, 10)).toBe(10);
    expect(roundUpToPack(11, 10)).toBe(20);
    expect(roundUpToPack(7, 1)).toBe(7);
    expect(roundUpToPack(0, 10)).toBe(0);
  });
});

describe('effectiveTerms — l’exception, sinon l’offre', () => {
  it('chaque champ de l’exception l’emporte seul', () => {
    const offerTerms = { supplierRef: 'TS-100', unitCostCents: 850 };
    expect(effectiveTerms(offerTerms, { supplierRef: null, unitCostCents: 990 })).toEqual({
      supplierRef: 'TS-100',
      unitCostCents: 990,
    });
    expect(effectiveTerms(offerTerms, { supplierRef: 'TS-100-XXL', unitCostCents: null })).toEqual({
      supplierRef: 'TS-100-XXL',
      unitCostCents: 850,
    });
    expect(effectiveTerms(offerTerms, null)).toEqual(offerTerms);
  });
});

describe('buildRestockPlan — le besoin (ADR-0021 §3)', () => {
  it('cible + précommandes − vendable − encours − brouillons, arrondi au colisage', () => {
    const plan = buildRestockPlan([
      declinaison({
        reorderTargetQty: 20,
        available: 2,
        onOrder: 5,
        inDraft: 3,
        preordered: 4,
        offers: [offre({ packSize: 10 })],
      }),
    ]);

    // 20 + 4 − 2 − 5 − 3 = 14, vendu par 10 → 20.
    expect(aCommander(plan).map((l) => [l.target, l.shortfall, l.suggestedQty])).toEqual([
      [20, 14, 20],
    ]);
  });

  it('le colisage est celui du fournisseur CHOISI, pas d’un autre fournisseur du produit', () => {
    const plan = buildRestockPlan([
      declinaison({
        available: 13,
        reorderThreshold: 15,
        preferredSupplierId: 'sup-b',
        offers: [
          offre({ packSize: 10 }),
          offre({ supplierId: 'sup-b', supplierName: 'Sport Import', packSize: 6 }),
        ],
      }),
    ]);

    // Manque 7, vendu par 6 → 12.
    expect(
      plan.groups.map((g) => [g.supplierId, g.lines[0].shortfall, g.lines[0].suggestedQty]),
    ).toEqual([['sup-b', 7, 12]]);
  });

  it('entre dans le plan : sous le seuil, seuil compris, ou attendue en précommande', () => {
    const plan = buildRestockPlan([
      declinaison({ variantId: 'au-seuil', available: 5, reorderThreshold: 5, reorderTargetQty: null }),
      declinaison({ variantId: 'au-dessus', available: 6, reorderThreshold: 5, reorderTargetQty: 20 }),
      declinaison({
        variantId: 'attendue',
        available: 0,
        reorderThreshold: null,
        reorderTargetQty: null,
        preordered: 3,
      }),
      declinaison({ variantId: 'sans-seuil', available: 0, reorderThreshold: null, reorderTargetQty: null }),
    ]);

    expect(aCommander(plan).map((l) => [l.variantId, l.shortfall]).sort()).toEqual([
      ['attendue', 3],
      ['au-seuil', 1],
    ]);
    expect(plan.covered).toEqual([]);
  });

  it('déjà couverte par l’encours : parmi les lignes couvertes, rien à commander', () => {
    // 20 − 2 − 25 < 0 : rien à commander, jamais un besoin négatif.
    const plan = buildRestockPlan([declinaison({ available: 2, onOrder: 25 })]);

    expect(plan.groups).toEqual([]);
    expect(plan.covered.map((l) => [l.variantId, l.shortfall, l.suggestedQty])).toEqual([
      ['v-m', 0, 0],
    ]);
  });

  it('sans fournisseur choisi, ou chez un fournisseur désactivé : mise à part, jamais regroupée', () => {
    const plan = buildRestockPlan([
      declinaison({ variantId: 'sans-choix', label: 'XL', preferredSupplierId: null }),
      declinaison({ variantId: 'choix-perdu', label: 'L', preferredSupplierId: 'sup-z' }),
      declinaison({ variantId: 'desactive', offers: [offre({ supplierActive: false })] }),
    ]);

    expect(plan.groups).toEqual([]);
    // Triées comme les groupes : produit, puis déclinaison.
    expect(plan.withoutSupplier.map((l) => l.variantId)).toEqual([
      'choix-perdu',
      'sans-choix',
    ]);
    expect(plan.inactiveSupplier.map((l) => [l.variantId, l.supplier?.supplierId])).toEqual([
      ['desactive', 'sup-a'],
    ]);
  });

  it('regroupe par fournisseur, trié par nom ; lignes triées par produit puis déclinaison', () => {
    const autre = offre({ supplierId: 'sup-b', supplierName: 'Adidas Club' });
    const plan = buildRestockPlan([
      declinaison({ variantId: 'ts-xl', label: 'XL' }),
      declinaison({ variantId: 'ts-l', label: 'L' }),
      declinaison({
        variantId: 'sac',
        productId: 'p-2',
        productName: 'Sac',
        label: null,
        preferredSupplierId: 'sup-b',
        offers: [autre],
      }),
    ]);

    expect(plan.groups.map((g) => [g.supplierName, g.lines.map((l) => l.variantId)])).toEqual([
      ['Adidas Club', ['sac']],
      ['Textiles Pro', ['ts-l', 'ts-xl']],
    ]);
  });

  it('la ligne porte chaque fournisseur du produit avec la quantité arrondie à SON colisage', () => {
    const autre = offre({ supplierId: 'sup-b', supplierName: 'Sport Import', unitCostCents: 700, packSize: 5 });
    const [ligne] = aCommander(buildRestockPlan([declinaison({ offers: [offre(), autre] })]));

    // Manque 20 − 2 = 18 : 18 à l'unité chez A, 20 par 5 chez B.
    expect(ligne.supplier).toEqual({ ...offre(), suggestedQty: 18 });
    expect(ligne.offers.map((o) => [o.supplierId, o.suggestedQty])).toEqual([
      ['sup-a', 18],
      ['sup-b', 20],
    ]);
  });
});
