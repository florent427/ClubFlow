import { registerEnumType } from '@nestjs/graphql';

/**
 * Ce qu'un adhérent peut faire d'une déclinaison, sans jamais savoir combien il
 * en reste (ADR-0018).
 *
 *   IN_STOCK  en stock, ou stock non suivi : servie à la commande
 *   PREORDER  épuisée, mais le club accepte la commande : servie à l'arrivage
 *   SOLD_OUT  épuisée, et non commandable
 */
export enum ShopAvailability {
  IN_STOCK = 'IN_STOCK',
  PREORDER = 'PREORDER',
  SOLD_OUT = 'SOLD_OUT',
}

registerEnumType(ShopAvailability, {
  name: 'ShopAvailability',
  description:
    'Disponibilité d’une déclinaison : en stock, sur commande (précommande) ou épuisée.',
});

/**
 * LA règle de disponibilité, en un seul endroit : le catalogue, le panier et
 * l'ajout au panier la lisent ici. Deux copies finiraient par se contredire —
 * un article « sur commande » au catalogue et « épuisé » dans le panier.
 *
 * Ne dépend que de `available > 0`, jamais de la quantité demandée : comparer
 * la quantité du panier au stock laisserait un adhérent retrouver le stock
 * exact en faisant varier sa quantité.
 */
export function availabilityOf(
  variant: { trackStock: boolean; available: number },
  preorderEnabled: boolean,
): ShopAvailability {
  if (!variant.trackStock || variant.available > 0) {
    return ShopAvailability.IN_STOCK;
  }
  return preorderEnabled
    ? ShopAvailability.PREORDER
    : ShopAvailability.SOLD_OUT;
}
