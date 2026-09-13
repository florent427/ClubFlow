import type { ShopCartItem, ViewerShopAvailability } from './shop-documents';

/**
 * Logique PURE de la disponibilité boutique (ADR-0018), testable sans rendu.
 *
 * L'adhérent ne connaît jamais une quantité : seulement ce que le serveur a
 * décidé — en stock, sur commande (épuisé mais commandable, remis à
 * l'arrivage) ou épuisé. Aucune fonction ci-dessous ne compare une quantité à
 * un stock.
 */

/** Peut-on mettre la déclinaison au panier ? En stock, ou sur commande. */
export function canAddToCart(availability: ViewerShopAvailability): boolean {
  return availability !== 'SOLD_OUT';
}

/**
 * Déclinaison proposée par défaut : la première en stock, sinon la première
 * commandable, sinon la première tout court.
 */
export function defaultVariantOf<
  V extends { availability: ViewerShopAvailability },
>(variants: readonly V[]): V | null {
  return (
    variants.find((v) => v.availability === 'IN_STOCK') ??
    variants.find((v) => v.availability === 'PREORDER') ??
    variants[0] ??
    null
  );
}

/** Pastille de disponibilité : libellé, ton et icône du composant `Pill`. */
export function availabilityPill(availability: ViewerShopAvailability): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
  icon: 'checkmark-circle-outline' | 'time-outline' | 'close-circle-outline';
} {
  if (availability === 'IN_STOCK') {
    return { label: 'Disponible', tone: 'success', icon: 'checkmark-circle-outline' };
  }
  if (availability === 'PREORDER') {
    return { label: 'Sur commande', tone: 'warning', icon: 'time-outline' };
  }
  return { label: 'Épuisé', tone: 'neutral', icon: 'close-circle-outline' };
}

/** Suffixe d'une déclinaison dans les puces (« L · sur commande »). */
export function availabilityChipSuffix(
  availability: ViewerShopAvailability,
): string {
  if (availability === 'PREORDER') return ' · sur commande';
  if (availability === 'SOLD_OUT') return ' · épuisé';
  return '';
}

/** Ce qu'on dit, sous le prix, d'un article épuisé mais commandable. */
export function preorderNotice(leadTime: string | null): string {
  return leadTime
    ? `Épuisé, mais commandable (délai indicatif : ${leadTime}). Il vous sera remis à son arrivée au club.`
    : 'Épuisé, mais commandable. Il vous sera remis à son arrivée au club.';
}

/**
 * Avertissement du panier quand il contient des articles sur commande ; `null`
 * s'il n'y en a pas. Le délai n'est cité que s'il vaut pour tous ces articles.
 */
export function cartPreorderNotice(
  items: readonly Pick<
    ShopCartItem,
    'availability' | 'preorderLeadTime' | 'unavailable'
  >[],
): string | null {
  const surCommande = items.filter(
    (it) => !it.unavailable && it.availability === 'PREORDER',
  );
  if (surCommande.length === 0) return null;
  const premier = surCommande[0].preorderLeadTime;
  const delai =
    premier && surCommande.every((it) => it.preorderLeadTime === premier)
      ? ` (délai indicatif : ${premier})`
      : '';
  return surCommande.length === 1
    ? `Un article de votre panier est sur commande : il vous sera remis à son arrivée au club${delai}. Il est facturé dès la commande.`
    : `Des articles de votre panier sont sur commande : ils vous seront remis à leur arrivée au club${delai}. Ils sont facturés dès la commande.`;
}
