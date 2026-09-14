import type {
  ShopRestockLine,
  ShopRestockOffer,
  ShopRestockPlan,
} from './types';

/**
 * Aperçu du réapprovisionnement (ADR-0021 §4) : ce que l'écran fait du plan
 * avant de créer les brouillons.
 *
 * Aucune règle de besoin ici : le manque et les quantités arrondies viennent du
 * serveur, pour chaque fournisseur du produit. L'écran ne fait que retenir un
 * fournisseur et une quantité par ligne — et le serveur revalide tout.
 */

/** Une ligne de l'aperçu, telle que l'admin la modifie. */
export type PreviewLine = {
  line: ShopRestockLine;
  /** Fournisseur retenu pour cette ligne ; null tant qu'aucun ne l'est. */
  supplierId: string | null;
  /** Quantité saisie, en texte : c'est un champ de formulaire. */
  qtyStr: string;
};

/**
 * Les lignes de l'aperçu, semées depuis le plan : ce qui est à commander, chez
 * le fournisseur choisi s'il est actif, à la quantité proposée. Une ligne sans
 * fournisseur actif part vide — l'admin doit en choisir un, ou la laisser.
 */
export function seedPreview(plan: ShopRestockPlan): PreviewLine[] {
  const toOrder = [
    ...plan.groups.flatMap((g) => g.lines),
    ...plan.withoutSupplier,
    ...plan.inactiveSupplier,
  ];
  return toOrder.map((line) => {
    const supplier = line.supplier?.supplierActive ? line.supplier : null;
    return {
      line,
      supplierId: supplier?.supplierId ?? null,
      qtyStr: supplier ? String(supplier.suggestedQty) : '',
    };
  });
}

/**
 * Relit l'aperçu après la retouche d'un produit — un fournisseur rattaché
 * depuis l'aperçu : les lignes de CE produit repartent du plan, les autres
 * gardent ce que l'admin y a saisi.
 */
export function refreshPreview(
  previous: PreviewLine[],
  plan: ShopRestockPlan,
  productId: string,
): PreviewLine[] {
  return seedPreview(plan).map((seeded) => {
    if (seeded.line.productId === productId) return seeded;
    const kept = previous.find((p) => p.line.variantId === seeded.line.variantId);
    return kept ? { ...kept, line: seeded.line } : seeded;
  });
}

/** Les fournisseurs vers lesquels basculer une ligne : ceux du produit, actifs. */
export function switchableOffers(line: ShopRestockLine): ShopRestockOffer[] {
  return line.offers.filter((o) => o.supplierActive);
}

/**
 * Bascule une ligne vers un autre fournisseur du produit : la quantité reprend
 * celle que le plan propose pour CE fournisseur, arrondie à SON colisage.
 * `null` retire la ligne de la commande.
 */
export function switchSupplier(
  preview: PreviewLine,
  supplierId: string | null,
): PreviewLine {
  if (supplierId === null) return { ...preview, supplierId: null, qtyStr: '' };
  const offer = switchableOffers(preview.line).find(
    (o) => o.supplierId === supplierId,
  );
  if (!offer) return preview;
  return { ...preview, supplierId, qtyStr: String(offer.suggestedQty) };
}

/** Quantité saisie : vide = ne pas commander (0) ; illisible = null. */
export function parseQty(input: string): number | null {
  const t = input.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export type PreviewGroup = {
  supplierId: string;
  supplierName: string;
  lines: PreviewLine[];
  /** Total HT des lignes au prix connu, en centimes. */
  knownTotalCents: number;
  /** Lignes commandées dont le prix est inconnu : le total est un minimum. */
  unknownCostLines: number;
};

/**
 * Regroupe l'aperçu par fournisseur retenu, trié par nom. `unassigned` : les
 * lignes sans fournisseur retenu, jamais commandées en l'état.
 */
export function groupPreview(lines: PreviewLine[]): {
  groups: PreviewGroup[];
  unassigned: PreviewLine[];
} {
  const groups = new Map<string, PreviewGroup>();
  const unassigned: PreviewLine[] = [];
  for (const preview of lines) {
    const offer = switchableOffers(preview.line).find(
      (o) => o.supplierId === preview.supplierId,
    );
    if (!offer) {
      unassigned.push(preview);
      continue;
    }
    const group = groups.get(offer.supplierId) ?? {
      supplierId: offer.supplierId,
      supplierName: offer.supplierName,
      lines: [],
      knownTotalCents: 0,
      unknownCostLines: 0,
    };
    group.lines.push(preview);
    const qty = parseQty(preview.qtyStr);
    if (qty !== null && qty > 0) {
      if (offer.unitCostCents === null) group.unknownCostLines += 1;
      else group.knownTotalCents += qty * offer.unitCostCents;
    }
    groups.set(offer.supplierId, group);
  }
  return {
    groups: [...groups.values()].sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName, 'fr'),
    ),
    unassigned,
  };
}

export type RestockOrderLine = {
  variantId: string;
  supplierId: string;
  qty: number;
};

function articleName(line: ShopRestockLine): string {
  return line.label ? `${line.productName} — ${line.label}` : line.productName;
}

/**
 * Les lignes à envoyer : quantité positive, fournisseur retenu. Tout est validé
 * avant l'envoi. Une ligne à commander sans fournisseur bloque tout, plutôt que
 * d'être oubliée en silence.
 */
export function planRestockOrders(
  lines: PreviewLine[],
): { ok: true; lines: RestockOrderLine[] } | { ok: false; error: string } {
  const out: RestockOrderLine[] = [];
  for (const preview of lines) {
    const qty = parseQty(preview.qtyStr);
    if (qty === null) {
      return {
        ok: false,
        error: `Quantité invalide sur « ${articleName(preview.line)} »`,
      };
    }
    if (qty === 0) continue;
    if (!preview.supplierId) {
      return {
        ok: false,
        error: `Choisissez un fournisseur pour « ${articleName(preview.line)} », ou videz sa quantité`,
      };
    }
    out.push({
      variantId: preview.line.variantId,
      supplierId: preview.supplierId,
      qty,
    });
  }
  if (out.length === 0) {
    return { ok: false, error: 'Rien à commander : toutes les quantités sont vides.' };
  }
  return { ok: true, lines: out };
}
