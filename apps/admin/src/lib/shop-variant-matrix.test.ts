import { describe, expect, it } from 'vitest';
import {
  eurosToCents,
  parseOptionalInt,
  planMatrixSave,
  seedRow,
} from './shop-variant-matrix';
import type { MatrixRowDraft } from './shop-variant-matrix';
import type { ShopProductVariant } from './types';

function variant(over: Partial<ShopProductVariant> = {}): ShopProductVariant {
  return {
    id: 'v1',
    productId: 'p1',
    isDefault: false,
    label: 'L / Rouge',
    sku: 'TS-L-R',
    unitPriceCents: 1500,
    trackStock: true,
    available: 10,
    onHand: 10,
    reorderThreshold: 3,
    // Reporting d'approvisionnement (ADR-0013) : null = « pas de commande en
    // cours » / « coût jamais renseigné ». La matrice ne s'en sert pas, mais
    // le type l'exige — et null est la valeur honnête par défaut.
    onOrder: null,
    avgCostCents: null,
    marginCents: null,
    marginRate: null,
    inStock: true,
    belowThreshold: false,
    active: true,
    ...over,
  };
}

/** Le plan d'une matrice d'une seule ligne, avec les modifications données. */
function planOne(v: ShopProductVariant, patch: Partial<MatrixRowDraft> = {}, tracked = true) {
  return planMatrixSave({
    variants: [v],
    rows: { [v.id]: { ...seedRow(v), ...patch } },
    tracked,
  });
}

describe('eurosToCents', () => {
  it('accepte la virgule comme le point', () => {
    expect(eurosToCents('12,50')).toBe(1250);
    expect(eurosToCents('12.50')).toBe(1250);
    expect(eurosToCents(' 8 ')).toBe(800);
  });

  it('refuse ce qui n’est pas un montant positif', () => {
    expect(eurosToCents('abc')).toBeNull();
    expect(eurosToCents('-3')).toBeNull();
  });
});

describe('parseOptionalInt', () => {
  it('traite le vide comme une absence de valeur, pas comme zéro', () => {
    expect(parseOptionalInt('')).toEqual({ ok: true, value: null });
    expect(parseOptionalInt('0')).toEqual({ ok: true, value: 0 });
  });

  it('refuse les décimales et les négatifs', () => {
    expect(parseOptionalInt('2.5')).toEqual({ ok: false });
    expect(parseOptionalInt('-1')).toEqual({ ok: false });
  });
});

describe('planMatrixSave', () => {
  it('n’émet RIEN pour une ligne que personne n’a touchée', () => {
    // L'invariant qui protège le journal de stock : enregistrer une matrice
    // de 24 lignes dont aucune n'a bougé ne doit pas déposer 24 corrections
    // d'inventaire.
    const plan = planOne(variant());
    expect(plan).toEqual({ ok: true, steps: [] });
  });

  it('compare le stock saisi à onHand, jamais à available', () => {
    // 12 physiques dont 5 déjà réservés par une commande en attente. Le champ
    // affiche 12 ; le laisser tel quel ne doit produire aucune écriture. S'il
    // était comparé à `available` (7), on enverrait countedOnHand=12 sur une
    // ligne intacte — ou pire, on afficherait 7 et le stock fondrait de 5 à
    // chaque enregistrement.
    const v = variant({ onHand: 12, available: 7 });
    expect(seedRow(v).countedStr).toBe('12');
    expect(planOne(v)).toEqual({ ok: true, steps: [] });

    const plan = planOne(v, { countedStr: '15' });
    expect(plan).toEqual({
      ok: true,
      steps: [{ variantId: 'v1', update: null, countedOnHand: 15 }],
    });
  });

  it('vider le prix rend l’héritage du prix produit', () => {
    const plan = planOne(variant(), { priceEuros: '' });
    expect(plan).toEqual({
      ok: true,
      steps: [
        { variantId: 'v1', update: { priceCents: null }, countedOnHand: null },
      ],
    });
  });

  it('un prix retapé à l’identique n’est pas envoyé', () => {
    expect(planOne(variant({ unitPriceCents: 1500 }), { priceEuros: '15,00' }))
      .toEqual({ ok: true, steps: [] });
  });

  it('décocher une combinaison la retire de la vente', () => {
    const plan = planOne(variant(), { active: false });
    expect(plan).toEqual({
      ok: true,
      steps: [
        { variantId: 'v1', update: { active: false }, countedOnHand: null },
      ],
    });
  });

  it('vider le seuil vaut « plus jamais d’alerte », pas zéro', () => {
    const plan = planOne(variant(), { thresholdStr: '' });
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          variantId: 'v1',
          update: { reorderThreshold: null },
          countedOnHand: null,
        },
      ],
    });
  });

  it('le passage en stock illimité s’applique à toute la matrice', () => {
    const a = variant({ id: 'a' });
    const b = variant({ id: 'b' });
    const plan = planMatrixSave({
      variants: [a, b],
      rows: { a: seedRow(a), b: seedRow(b) },
      tracked: false,
    });
    expect(plan).toEqual({
      ok: true,
      steps: [
        { variantId: 'a', update: { trackStock: false }, countedOnHand: null },
        { variantId: 'b', update: { trackStock: false }, countedOnHand: null },
      ],
    });
  });

  it('ignore le stock saisi quand la matrice n’est pas suivie', () => {
    // Une correction d'inventaire sur une déclinaison non suivie serait
    // refusée par le moteur ; on ne la planifie donc pas.
    const v = variant({ trackStock: false });
    const plan = planOne(v, { countedStr: '99' }, false);
    expect(plan).toEqual({ ok: true, steps: [] });
  });

  it('reprend le suivi puis déclare le stock, dans cet ordre', () => {
    // trackStock d'abord : la correction d'inventaire échouerait sur une
    // déclinaison encore marquée « illimité ».
    const v = variant({ trackStock: false, onHand: 0 });
    const plan = planOne(v, { countedStr: '20' }, true);
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          variantId: 'v1',
          update: { trackStock: true },
          countedOnHand: 20,
        },
      ],
    });
  });

  it('refuse le plan ENTIER dès qu’une ligne est invalide', () => {
    // Une faute de frappe sur la seconde ligne ne doit pas laisser la première
    // enregistrée et le reste non.
    const a = variant({ id: 'a', label: 'S' });
    const b = variant({ id: 'b', label: 'M' });
    const plan = planMatrixSave({
      variants: [a, b],
      rows: {
        a: { ...seedRow(a), countedStr: '5' },
        b: { ...seedRow(b), priceEuros: 'douze euros' },
      },
      tracked: true,
    });
    expect(plan).toEqual({ ok: false, error: 'Prix invalide sur « M »' });
  });

  it('cumule mise à jour descriptive et correction de stock sur une même ligne', () => {
    const plan = planOne(variant(), { sku: 'NEW-SKU', countedStr: '4' });
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          variantId: 'v1',
          update: { sku: 'NEW-SKU' },
          countedOnHand: 4,
        },
      ],
    });
  });

  it('vider la référence l’efface au lieu d’enregistrer une chaîne vide', () => {
    const plan = planOne(variant({ sku: 'TS-L-R' }), { sku: '   ' });
    expect(plan).toEqual({
      ok: true,
      steps: [{ variantId: 'v1', update: { sku: null }, countedOnHand: null }],
    });
  });
});
