import type {
  ShopProduct,
  ShopProductSupplierOffer,
  ShopSupplier,
} from './types';
import {
  centsToInput,
  eurosToCents,
  parseOptionalInt,
} from './shop-variant-matrix';

/**
 * Fournisseurs d'un produit (ADR-0021) : ce que l'écran calcule avant
 * d'écrire.
 *
 * Extrait du composant pour la même raison que la matrice des déclinaisons :
 * les fautes qui comptent ici sont muettes à l'écran. Un prix vidé envoyé à 0
 * au lieu de « inconnu » tirerait le coût moyen vers le bas à la première
 * réception ; une exception réécrite sur une ligne que personne n'a touchée
 * figerait un prix que l'offre ne pourrait plus corriger.
 */

/** Le fournisseur choisi du produit, s'il y en a un. */
export function preferredOffer(
  product: Pick<ShopProduct, 'suppliers'>,
): ShopProductSupplierOffer | null {
  return product.suppliers?.find((o) => o.preferred) ?? null;
}

/**
 * Référence et prix EFFECTIFS d'une déclinaison chez un fournisseur :
 * l'exception de la déclinaison, sinon l'offre. `…Inherited` dit d'où vient
 * chaque valeur.
 */
export function effectiveTerms(
  offer: ShopProductSupplierOffer,
  variantId: string,
): {
  supplierRef: string | null;
  unitCostCents: number | null;
  refInherited: boolean;
  costInherited: boolean;
} {
  const override = offer.variantOverrides.find((x) => x.variantId === variantId);
  return {
    supplierRef: override?.supplierRef ?? offer.supplierRef,
    unitCostCents: override?.unitCostCents ?? offer.unitCostCents,
    refInherited: override?.supplierRef == null,
    costInherited: override?.unitCostCents == null,
  };
}

/** Fournisseurs ACTIFS qu'on peut encore rattacher à ce produit. */
export function linkableSuppliers(
  suppliers: ShopSupplier[],
  product: Pick<ShopProduct, 'suppliers'>,
): ShopSupplier[] {
  const linked = new Set((product.suppliers ?? []).map((o) => o.supplierId));
  return suppliers.filter((s) => s.active && !linked.has(s.id));
}

/** Saisie d'une offre : tout en `string`, ce sont des champs de formulaire. */
export type OfferDraft = {
  supplierRef: string;
  costEuros: string;
  packSizeStr: string;
};

export function offerDraftFrom(
  offer: ShopProductSupplierOffer | null,
): OfferDraft {
  return {
    supplierRef: offer?.supplierRef ?? '',
    costEuros:
      offer?.unitCostCents == null ? '' : centsToInput(offer.unitCostCents),
    packSizeStr: offer ? String(offer.packSize) : '1',
  };
}

export type OfferTerms = {
  supplierRef: string | null;
  unitCostCents: number | null;
  packSize: number;
};

/**
 * Valide une offre saisie, en bloc. Un prix vidé part à `null` — « inconnu » —,
 * jamais à 0 : `eurosToCents('')` rendrait 0, d'où le test du champ vide avant.
 */
export function planOffer(
  draft: OfferDraft,
): { ok: true; terms: OfferTerms } | { ok: false; error: string } {
  let unitCostCents: number | null = null;
  if (draft.costEuros.trim() !== '') {
    unitCostCents = eurosToCents(draft.costEuros);
    if (unitCostCents === null) {
      return { ok: false, error: 'Prix d’achat invalide' };
    }
  }
  const pack = parseOptionalInt(draft.packSizeStr);
  if (!pack.ok || pack.value === null || pack.value < 1) {
    return {
      ok: false,
      error: 'Le colisage est un nombre entier d’au moins 1',
    };
  }
  const ref = draft.supplierRef.trim();
  return {
    ok: true,
    terms: {
      supplierRef: ref === '' ? null : ref,
      unitCostCents,
      packSize: pack.value,
    },
  };
}

/** Saisie de l'exception d'une déclinaison. Vide = hérite de l'offre. */
export type OverrideDraft = { supplierRef: string; costEuros: string };

/** L'exception telle que la base la raconte. Sert de référence au diff. */
export function overrideDraftFrom(
  offer: ShopProductSupplierOffer,
  variantId: string,
): OverrideDraft {
  const x = offer.variantOverrides.find((o) => o.variantId === variantId);
  return {
    supplierRef: x?.supplierRef ?? '',
    costEuros: x?.unitCostCents == null ? '' : centsToInput(x.unitCostCents),
  };
}

export type OverrideStep = {
  variantId: string;
  supplierRef: string | null;
  unitCostCents: number | null;
};

/**
 * Les exceptions à écrire : seulement les déclinaisons MODIFIÉES, toutes
 * validées avant la première écriture. Vider les deux champs supprime
 * l'exception — la mutation le fait quand les deux valeurs sont nulles.
 */
export function planOverrides(args: {
  offer: ShopProductSupplierOffer;
  variantIds: string[];
  rows: Record<string, OverrideDraft>;
  labels: Record<string, string>;
}): { ok: true; steps: OverrideStep[] } | { ok: false; error: string } {
  const steps: OverrideStep[] = [];
  for (const variantId of args.variantIds) {
    const row = args.rows[variantId];
    if (!row) continue;
    const base = overrideDraftFrom(args.offer, variantId);
    if (
      row.supplierRef.trim() === base.supplierRef.trim() &&
      row.costEuros.trim() === base.costEuros.trim()
    ) {
      continue;
    }
    let unitCostCents: number | null = null;
    if (row.costEuros.trim() !== '') {
      unitCostCents = eurosToCents(row.costEuros);
      if (unitCostCents === null) {
        const name = args.labels[variantId] ?? 'déclinaison';
        return { ok: false, error: `Prix d’achat invalide sur « ${name} »` };
      }
    }
    const ref = row.supplierRef.trim();
    steps.push({
      variantId,
      supplierRef: ref === '' ? null : ref,
      unitCostCents,
    });
  }
  return { ok: true, steps };
}
