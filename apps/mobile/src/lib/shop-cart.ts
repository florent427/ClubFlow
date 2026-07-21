import type { ShopCart, ShopCartItem } from './shop-documents';

/**
 * Logique PURE du panier boutique (ADR-0012). Aucune de ces fonctions ne
 * connaît, ne calcule ni n'expose une quantité de stock : elles ne
 * manipulent que des booléens (`inStock`, `unavailable`) et des montants.
 * Le serveur reste seul juge de la disponibilité et du 3×.
 */

/** Nombre total d'articles (somme des quantités) — sert au badge du panier. */
export function shopCartItemCount(
  cart: Pick<ShopCart, 'items'> | null | undefined,
): number {
  if (!cart) return 0;
  return cart.items.reduce((sum, it) => sum + it.quantity, 0);
}

/**
 * Recalcule le total à partir des lignes. Le serveur reste la source de
 * vérité (`cart.totalCents`) ; cette fonction n'existe que pour vérifier la
 * cohérence (test) et n'affiche jamais un total divergent de celui du serveur.
 */
export function computeShopCartTotalCents(
  items: readonly Pick<ShopCartItem, 'lineTotalCents'>[],
): number {
  return items.reduce((sum, it) => sum + it.lineTotalCents, 0);
}

/**
 * Vrai si au moins une ligne est épuisée ou devenue indisponible. Ne lit QUE
 * les booléens `inStock` / `unavailable` — jamais un compteur. Sert à afficher
 * une bannière d'avertissement ; le refus ferme reste au serveur au checkout,
 * dont le message est affiché tel quel.
 */
export function shopCartHasBlockingItems(
  items: readonly Pick<ShopCartItem, 'inStock' | 'unavailable'>[],
): boolean {
  return items.some((it) => it.unavailable || !it.inStock);
}

/**
 * Le panier peut partir au checkout dès qu'il contient au moins une ligne. On
 * NE bloque PAS sur une ligne épuisée : c'est volontaire. Le serveur arbitre la
 * disponibilité réelle (il connaît la quantité, pas le client) et son refus
 * doit remonter à l'écran — le masquer derrière un gate client priverait
 * l'adhérent du vrai motif.
 */
export function canCheckoutShopCart(
  cart: Pick<ShopCart, 'items'> | null | undefined,
): boolean {
  return !!cart && cart.items.length > 0;
}
