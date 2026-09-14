/**
 * Plan de réapprovisionnement (ADR-0021 §3).
 *
 * Module PUR : aucune I/O. C'est ici, et nulle part ailleurs, que se décide ce
 * qu'il faut commander. L'aperçu de l'admin l'affiche ; la création des
 * brouillons revalide ce qu'on lui envoie, mais ne recalcule jamais le besoin.
 *
 *   besoin = max(0, cible + précommandes − vendable − encours − brouillons)
 *            arrondi au multiple supérieur du colisage du fournisseur choisi
 */

/** Conditions d'achat d'une déclinaison chez un fournisseur, exception appliquée. */
export type RestockOfferTerms = {
  supplierId: string;
  supplierName: string;
  supplierActive: boolean;
  supplierRef: string | null;
  /** Prix d'achat HT en centimes. Null = inconnu, jamais « gratuit ». */
  unitCostCents: number | null;
  packSize: number;
};

/**
 * Un fournisseur du produit, sur une ligne du plan : ses conditions, et le
 * manque arrondi à SON colisage. Basculer la ligne vers lui reprend cette
 * quantité — l'écran n'a pas à refaire l'arrondi.
 */
export type RestockLineOffer = RestockOfferTerms & { suggestedQty: number };

/**
 * Une déclinaison candidate. L'appelant ne fournit que des déclinaisons SUIVIES
 * et EN VENTE d'un produit en vente : une déclinaison non suivie a un stock
 * illimité, une déclinaison retirée ne se recommande pas.
 */
export type RestockVariantInput = {
  variantId: string;
  productId: string;
  productName: string;
  label: string | null;
  sku: string | null;
  available: number;
  /** Stock physique : le vendable, plus ce qui est réservé et pas encore remis. */
  onHand: number;
  reorderThreshold: number | null;
  reorderTargetQty: number | null;
  /** Alerte de seuil déjà envoyée au club ; null s'il n'a pas été prévenu. */
  alertedAt: Date | null;
  /** Commandé chez un fournisseur, pas encore reçu (ADR-0013 §4). */
  onOrder: number;
  /** Promis en précommande, en attente d'arrivage (ADR-0018). */
  preordered: number;
  /** Déjà porté par un brouillon, chez n'importe quel fournisseur. */
  inDraft: number;
  preferredSupplierId: string | null;
  offers: RestockOfferTerms[];
};

export type RestockLine = Omit<RestockVariantInput, 'preferredSupplierId' | 'offers'> & {
  /** Quantité visée : la cible, à défaut le seuil + 1, à défaut 0. */
  target: number;
  /** Ce qui manque, avant arrondi. Zéro : déjà couvert. */
  shortfall: number;
  /** Le manque arrondi au colisage du fournisseur choisi. */
  suggestedQty: number;
  /** Le fournisseur choisi du produit, actif ou non. Null : aucun choix. */
  supplier: RestockLineOffer | null;
  /** Tous les fournisseurs du produit, pour basculer la ligne vers un autre. */
  offers: RestockLineOffer[];
};

export type RestockGroup = {
  supplierId: string;
  supplierName: string;
  lines: RestockLine[];
};

export type RestockPlan = {
  /** À commander, regroupé par fournisseur choisi et actif. */
  groups: RestockGroup[];
  /** À commander, mais aucun fournisseur choisi : jamais commandé en l'état. */
  withoutSupplier: RestockLine[];
  /** À commander, mais le fournisseur choisi est désactivé. */
  inactiveSupplier: RestockLine[];
  /** Dans le plan, mais déjà couvert par le stock, l'encours ou un brouillon. */
  covered: RestockLine[];
};

/** Référence et prix d'une déclinaison chez un fournisseur : l'exception, sinon l'offre. */
export function effectiveTerms(
  offer: { supplierRef: string | null; unitCostCents: number | null },
  override?: { supplierRef: string | null; unitCostCents: number | null } | null,
): { supplierRef: string | null; unitCostCents: number | null } {
  return {
    supplierRef: override?.supplierRef ?? offer.supplierRef,
    unitCostCents: override?.unitCostCents ?? offer.unitCostCents,
  };
}

/**
 * La quantité visée : la cible de réapprovisionnement, à défaut une unité de
 * plus que le seuil — la règle historique de l'onglet —, à défaut rien.
 */
export function restockTarget(
  v: Pick<RestockVariantInput, 'reorderThreshold' | 'reorderTargetQty'>,
): number {
  if (v.reorderTargetQty !== null) return v.reorderTargetQty;
  if (v.reorderThreshold !== null) return v.reorderThreshold + 1;
  return 0;
}

/** Arrondit au multiple supérieur du colisage : on n'achète pas 7 t-shirts vendus par 10. */
export function roundUpToPack(qty: number, packSize: number): number {
  if (qty <= 0) return 0;
  const pack = Math.max(1, packSize);
  return Math.ceil(qty / pack) * pack;
}

/** Sous son seuil — seuil compris —, ou attendue par des adhérents. */
function inScope(v: RestockVariantInput): boolean {
  return (
    (v.reorderThreshold !== null && v.available <= v.reorderThreshold) ||
    v.preordered > 0
  );
}

export function buildRestockPlan(variants: RestockVariantInput[]): RestockPlan {
  const plan: RestockPlan = {
    groups: [],
    withoutSupplier: [],
    inactiveSupplier: [],
    covered: [],
  };
  const groups = new Map<string, RestockGroup>();

  for (const v of variants.filter(inScope)) {
    const { preferredSupplierId, offers: terms, ...rest } = v;
    const target = restockTarget(v);
    const shortfall = Math.max(
      0,
      target + v.preordered - v.available - v.onOrder - v.inDraft,
    );
    const offers = terms.map((o) => ({
      ...o,
      suggestedQty: roundUpToPack(shortfall, o.packSize),
    }));
    const supplier =
      offers.find((o) => o.supplierId === preferredSupplierId) ?? null;
    const line: RestockLine = {
      ...rest,
      target,
      shortfall,
      suggestedQty: supplier?.suggestedQty ?? shortfall,
      supplier,
      offers,
    };

    if (shortfall === 0) {
      plan.covered.push(line);
    } else if (!supplier) {
      plan.withoutSupplier.push(line);
    } else if (!supplier.supplierActive) {
      plan.inactiveSupplier.push(line);
    } else {
      const group = groups.get(supplier.supplierId) ?? {
        supplierId: supplier.supplierId,
        supplierName: supplier.supplierName,
        lines: [],
      };
      group.lines.push(line);
      groups.set(supplier.supplierId, group);
    }
  }

  const byArticle = (a: RestockLine, b: RestockLine) =>
    a.productName.localeCompare(b.productName, 'fr') ||
    (a.label ?? '').localeCompare(b.label ?? '', 'fr');

  plan.groups = [...groups.values()].sort((a, b) =>
    a.supplierName.localeCompare(b.supplierName, 'fr'),
  );
  for (const group of plan.groups) group.lines.sort(byArticle);
  plan.withoutSupplier.sort(byArticle);
  plan.inactiveSupplier.sort(byArticle);
  plan.covered.sort(byArticle);
  return plan;
}
