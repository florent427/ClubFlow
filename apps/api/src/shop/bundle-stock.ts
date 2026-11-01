/**
 * Stock DÉRIVÉ d'un pack (ADR-0024) : combien de packs ses pièces permettent
 * de composer.
 *
 * Calqué sur ce que la réservation accepte, pièce par pièce : une pièce retirée
 * de la vente bloque le pack, une pièce non suivie ne le limite pas, une pièce
 * suivie en permet `floor(available / quantité)`. Le pack se vend tant que ce
 * minimum est positif ; un pack sans pièce n'a rien à vendre.
 *
 * Ce calcul n'est qu'un AFFICHAGE : la garantie reste la réservation
 * conditionnelle de chaque pièce, dans la transaction de la commande.
 */
export type BundlePartStock = {
  quantity: number;
  component: {
    active: boolean;
    trackStock: boolean;
    onHand: number;
    available: number;
  };
};

export function bundleCounters(parts: BundlePartStock[]): {
  trackStock: boolean;
  onHand: number;
  available: number;
} {
  if (parts.length === 0) return { trackStock: true, onHand: 0, available: 0 };

  let available = Infinity;
  let onHand = Infinity;
  for (const { quantity, component } of parts) {
    if (!component.active) {
      available = 0;
      continue;
    }
    if (!component.trackStock) continue;
    available = Math.min(available, Math.floor(component.available / quantity));
    onHand = Math.min(onHand, Math.floor(component.onHand / quantity));
  }

  // Aucune pièce suivie ni bloquante : le pack est illimité, comme elles.
  if (available === Infinity) return { trackStock: false, onHand: 0, available: 0 };
  return {
    trackStock: true,
    onHand: onHand === Infinity ? 0 : onHand,
    available,
  };
}

/**
 * Ce qu'il faut charger d'une déclinaison pour en dériver le stock si c'est
 * un pack. À joindre à TOUTE lecture qui juge une disponibilité : l'oublier
 * ferait lire un pack comme épuisé.
 */
export const BUNDLE_STOCK_INCLUDE = {
  bundleComponents: {
    select: {
      quantity: true,
      component: {
        select: { active: true, trackStock: true, onHand: true, available: true },
      },
    },
  },
} as const;

/**
 * Les compteurs à lire : ceux de la déclinaison, ou ceux que ses pièces
 * permettent pour un pack. Un pack sans pièces chargées compte pour épuisé.
 */
export function stockOf(v: {
  isBundle: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  bundleComponents?: BundlePartStock[];
}): { trackStock: boolean; onHand: number; available: number } {
  if (!v.isBundle) {
    return { trackStock: v.trackStock, onHand: v.onHand, available: v.available };
  }
  return bundleCounters(v.bundleComponents ?? []);
}
