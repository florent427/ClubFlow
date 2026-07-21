import type { ViewerShopCartItem } from './viewer-types';

/**
 * Logique PURE du panier boutique — extraite du composant pour être testable
 * sans DOM (le portail n'a ni jsdom ni happy-dom ; vitest tourne en env node).
 *
 * Règle de confidentialité (ADR-0012) rappelée ici parce qu'elle contraint ce
 * module autant que l'UI : on ne manipule JAMAIS de quantité de stock. Les
 * seules informations de disponibilité sont les booléens `inStock` et
 * `unavailable` portés par chaque ligne. Aucune fonction ci-dessous ne prend,
 * ne calcule ni ne renvoie un niveau de stock.
 */

/**
 * Sépare les lignes vendables des lignes devenues indisponibles.
 *
 * Une ligne `unavailable` (produit/déclinaison désactivé après l'ajout) reste
 * affichée — le membre doit comprendre pourquoi son total a changé — mais elle
 * ne pèse pas dans le total et sera refusée au checkout. C'est la même
 * frontière que le serveur applique dans `shapeCart`.
 */
export function partitionCart(items: ViewerShopCartItem[]): {
  available: ViewerShopCartItem[];
  unavailable: ViewerShopCartItem[];
} {
  const available: ViewerShopCartItem[] = [];
  const unavailable: ViewerShopCartItem[] = [];
  for (const it of items) {
    if (it.unavailable) unavailable.push(it);
    else available.push(it);
  }
  return { available, unavailable };
}

/**
 * Total client des seules lignes VENDABLES (mêmes exclusions que le serveur :
 * une ligne `unavailable` ne compte pas). Sert de repli d'affichage si jamais
 * le `totalCents` serveur manquait ; l'UI privilégie toujours le total serveur.
 */
export function computeCartTotalCents(items: ViewerShopCartItem[]): number {
  let sum = 0;
  for (const it of items) {
    if (!it.unavailable) sum += it.lineTotalCents;
  }
  return sum;
}

/** Nombre total d'ARTICLES commandés (somme des quantités vendables). */
export function countCartUnits(items: ViewerShopCartItem[]): number {
  let n = 0;
  for (const it of items) {
    if (!it.unavailable) n += it.quantity;
  }
  return n;
}

/** Le panier peut-il partir au checkout ? Au moins une ligne vendable. */
export function canCheckout(items: ViewerShopCartItem[]): boolean {
  return items.some((it) => !it.unavailable);
}

export type InstallmentsPreview = {
  /** Montant des 2 premières échéances. */
  base: number;
  /** Montant ajusté de la dernière (absorbe l'arrondi). */
  last: number;
  /** Les 3 échéances sont-elles strictement égales ? */
  equal: boolean;
};

/**
 * Aperçu d'un règlement en 3× : 2 échéances arrondies + un solde ajusté
 * (ex. 250,00 € → 2 × 83,33 € puis 83,34 €). Reproduit fidèlement le calcul de
 * `PaymentChoiceModal` pour l'adhésion, afin que boutique et adhésion affichent
 * le même échéancier. NE décide PAS de l'éligibilité au 3× : c'est le serveur
 * qui l'arbitre contre le seuil du club (que l'adhérent ne peut pas lire).
 */
export function installmentsPreview(totalCents: number): InstallmentsPreview {
  const base = Math.round(totalCents / 3);
  const last = totalCents - base * 2;
  return { base, last, equal: base === last };
}
