import type { ShopProduct, ShopProductVariant } from './types';

/**
 * Packs composés (ADR-0024) — la logique pure de l'éditeur de composition.
 *
 * Un pack est une déclinaison vendue, jamais stockée : vendre « Pack complet »
 * réserve les gants et les protège-pieds qu'il contient, et c'est leur stock
 * qui dit combien de packs sont vendables.
 */

/** Une ligne de l'éditeur : une pièce choisie et sa quantité saisie. */
export type BundleRowDraft = {
  componentVariantId: string;
  quantityStr: string;
};

/** Une pièce proposée dans la liste déroulante. */
export type BundlePieceOption = {
  variantId: string;
  /** « Gants — Rouge / M », ou le nom seul pour un produit sans déclinaison. */
  label: string;
};

/** Nom d'une déclinaison tel que l'éditeur l'affiche. */
export function variantDisplayName(product: ShopProduct, v: ShopProductVariant): string {
  return v.isDefault || !v.label ? product.name : `${product.name} — ${v.label}`;
}

/** « 1 × Gants — Rouge, 1 × Protège-pieds — Rouge / M ». */
export function bundleSummary(v: Pick<ShopProductVariant, 'bundleComponents'>): string {
  return v.bundleComponents.map((c) => `${c.quantity} × ${c.label}`).join(', ');
}

/** Vrai si une déclinaison du produit est un pack. */
export function productHasBundle(p: Pick<ShopProduct, 'variants'>): boolean {
  return p.variants.some((v) => v.isBundle);
}

/**
 * Les pièces possibles : les déclinaisons d'AUTRES produits, qui ne sont pas
 * des packs et dont le stock est suivi — les règles que le serveur applique.
 * Une déclinaison retirée de la vente reste proposée : la composer est permis,
 * le pack se lira simplement épuisé tant qu'elle l'est.
 *
 * Pour un produit à déclinaisons, la déclinaison par défaut est cachée : elle
 * n'est jamais vendue.
 */
export function bundlePieceOptions(
  products: ShopProduct[],
  packProductId: string,
): BundlePieceOption[] {
  const out: BundlePieceOption[] = [];
  for (const p of products) {
    if (p.id === packProductId) continue;
    for (const v of p.variants) {
      if (v.isBundle || !v.trackStock) continue;
      if (p.hasVariants && v.isDefault) continue;
      out.push({ variantId: v.id, label: variantDisplayName(p, v) });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/** Les lignes de l'éditeur, semées depuis la composition enregistrée. */
export function seedBundleRows(v: ShopProductVariant): BundleRowDraft[] {
  return v.bundleComponents.map((c) => ({
    componentVariantId: c.componentVariantId,
    quantityStr: String(c.quantity),
  }));
}

export type BundlePlan =
  | { ok: true; components: Array<{ componentVariantId: string; quantity: number }> }
  | { ok: false; error: string };

/**
 * Ce que l'éditeur envoie, validé avant tout appel : lignes vides ignorées,
 * quantité entière de 1 à 99, une pièce une seule fois. Une liste vide
 * dissout le pack — c'est le bouton « Dissoudre » qui l'envoie, pas un oubli.
 */
export function planBundle(rows: BundleRowDraft[]): BundlePlan {
  const components: Array<{ componentVariantId: string; quantity: number }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.componentVariantId === '') continue;
    const quantity = Number(row.quantityStr.trim());
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { ok: false, error: 'La quantité d’une pièce va de 1 à 99.' };
    }
    if (seen.has(row.componentVariantId)) {
      return {
        ok: false,
        error: 'Une pièce figure deux fois : regroupez-la sur une seule ligne.',
      };
    }
    seen.add(row.componentVariantId);
    components.push({ componentVariantId: row.componentVariantId, quantity });
  }
  if (components.length === 0) {
    return { ok: false, error: 'Choisissez au moins une pièce.' };
  }
  return { ok: true, components };
}
