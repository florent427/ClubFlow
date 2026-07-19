import type { ShopProductVariant } from './types';

/**
 * Le calcul des écritures à émettre depuis la matrice des déclinaisons.
 *
 * Extrait du composant parce que c'est ici que se joue tout ce qui peut mal
 * tourner : envoyer une correction d'inventaire sur une ligne que personne n'a
 * touchée polluerait le journal de stock à chaque enregistrement, et confondre
 * `onHand` avec `available` ferait fondre le stock du montant des commandes en
 * attente. Ces deux fautes-là sont muettes à l'écran — elles ne se voient que
 * dans un test.
 */

/**
 * L'état saisi d'une ligne. Tout est en `string` : ce sont des champs de
 * formulaire, et convertir trop tôt ferait disparaître la saisie en cours dès
 * qu'elle est temporairement invalide (« 12, »).
 */
export type MatrixRowDraft = {
  active: boolean;
  sku: string;
  priceEuros: string;
  /** Stock PHYSIQUE compté — c'est `onHand`, jamais `available`. */
  countedStr: string;
  thresholdStr: string;
};

/** Champs descriptifs d'une déclinaison. Ni `onHand` ni `available` : toute
 *  écriture de stock passe par le moteur (ADR-0012). */
export type VariantUpdatePayload = {
  active?: boolean;
  sku?: string | null;
  priceCents?: number | null;
  reorderThreshold?: number | null;
  trackStock?: boolean;
};

export type MatrixStep = {
  variantId: string;
  /** Ce qu'il faut mettre à jour, ou null si seul le stock change. */
  update: VariantUpdatePayload | null;
  /** Stock physique déclaré, ou null si l'admin ne l'a pas touché. */
  countedOnHand: number | null;
};

export type MatrixPlan =
  | { ok: true; steps: MatrixStep[] }
  | { ok: false; error: string };

/** Saisie « 12,50 » → 1250. Null si ce n'est pas un montant valide. */
export function eurosToCents(input: string): number | null {
  const n = Number(input.replace(',', '.').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Champ entier facultatif : vide → null, saisie invalide → `ok: false`. */
export function parseOptionalInt(
  input: string,
): { ok: true; value: number | null } | { ok: false } {
  const t = input.trim();
  if (t === '') return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/** L'état d'une ligne tel que la base le raconte. Sert de référence au diff. */
export function seedRow(v: ShopProductVariant): MatrixRowDraft {
  return {
    active: v.active,
    sku: v.sku ?? '',
    // `unitPriceCents` est le prix APPLIQUÉ : celui de la déclinaison, ou à
    // défaut celui du produit. On ne peut donc pas distinguer à l'écran un prix
    // propre d'un prix hérité — d'où la règle : un champ laissé tel quel n'est
    // jamais envoyé, et vider le champ rend l'héritage.
    priceEuros: centsToInput(v.unitPriceCents),
    countedStr: v.onHand === null ? '' : String(v.onHand),
    thresholdStr: v.reorderThreshold === null ? '' : String(v.reorderThreshold),
  };
}

/**
 * Calcule les écritures à émettre — et ne les émet pas.
 *
 * Deux invariants portés ici :
 *
 *  1. **Une ligne non modifiée ne produit AUCUNE écriture.** Sans cela, chaque
 *     enregistrement d'une matrice de 24 lignes déposerait 24 corrections
 *     d'inventaire dans le journal, et « pourquoi il manque trois t-shirts ? »
 *     deviendrait de nouveau sans réponse.
 *  2. **Le stock déclaré est comparé à `onHand`**, le physique, parce que c'est
 *     `countedOnHand` que la mutation attend. Le comparer à `available`
 *     enverrait une correction dès qu'une commande est en attente de paiement,
 *     et le stock fondrait du montant des réservations.
 *
 * La validation est intégrale et préalable : une faute de frappe sur la ligne
 * 20 ne doit pas laisser 19 lignes enregistrées et le reste non.
 */
export function planMatrixSave(args: {
  variants: ShopProductVariant[];
  rows: Record<string, MatrixRowDraft>;
  /** Suivi du stock, décidé pour toute la matrice d'un coup. */
  tracked: boolean;
}): MatrixPlan {
  const { variants, rows, tracked } = args;
  const steps: MatrixStep[] = [];

  for (const v of variants) {
    const row = rows[v.id];
    if (!row) continue;
    const base = seedRow(v);
    const name = v.label ?? 'déclinaison';
    const update: VariantUpdatePayload = {};
    let touched = false;

    if (row.active !== base.active) {
      update.active = row.active;
      touched = true;
    }
    if (row.sku.trim() !== base.sku.trim()) {
      update.sku = row.sku.trim() === '' ? null : row.sku.trim();
      touched = true;
    }
    if (row.priceEuros.trim() !== base.priceEuros.trim()) {
      if (row.priceEuros.trim() === '') {
        update.priceCents = null; // rend l'héritage du prix produit
      } else {
        const cents = eurosToCents(row.priceEuros);
        if (cents === null) {
          return { ok: false, error: `Prix invalide sur « ${name} »` };
        }
        update.priceCents = cents;
      }
      touched = true;
    }
    if (row.thresholdStr.trim() !== base.thresholdStr.trim()) {
      const parsed = parseOptionalInt(row.thresholdStr);
      if (!parsed.ok) {
        return { ok: false, error: `Seuil invalide sur « ${name} »` };
      }
      update.reorderThreshold = parsed.value;
      touched = true;
    }
    if (tracked !== v.trackStock) {
      update.trackStock = tracked;
      touched = true;
    }

    let countedOnHand: number | null = null;
    if (tracked && row.countedStr.trim() !== base.countedStr.trim()) {
      const parsed = parseOptionalInt(row.countedStr);
      if (!parsed.ok || parsed.value === null) {
        return { ok: false, error: `Stock invalide sur « ${name} »` };
      }
      countedOnHand = parsed.value;
    }

    if (!touched && countedOnHand === null) continue;
    steps.push({
      variantId: v.id,
      update: touched ? update : null,
      countedOnHand,
    });
  }

  return { ok: true, steps };
}
