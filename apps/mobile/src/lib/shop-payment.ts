import type { ViewerShopOrderStatus } from './shop-documents';

/**
 * Logique PURE du paiement boutique (retour Stripe + éligibilité des actions
 * sur une commande). Séparée de l'UI pour être testable : rien ici n'ouvre de
 * navigateur ni ne touche au réseau.
 *
 * ── Le retour de `WebBrowser.openAuthSessionAsync` ────────────────────────
 * La session s'ouvre sur `stripeCheckoutUrl` et se REFERME d'elle-même dès que
 * Stripe redirige vers une URL préfixée par `paymentReturnUrl`. Les cas :
 *   - `type === 'success'` + `url` contenant `paid=1`     → paiement passé
 *     côté Stripe (mais la commande reste PENDING tant que le webhook n'a pas
 *     tourné : voir `interpretStripeReturn`).
 *   - `url` contenant `canceled=1`                         → paiement annulé
 *     depuis la page Stripe (bouton « retour »).
 *   - `type === 'cancel' | 'dismiss'`                      → l'utilisateur a
 *     fermé le navigateur intégré sans finir.
 */

/**
 * Résultat métier d'un retour de paiement. On ne dit JAMAIS « payée » :
 * `paid` signifie « Stripe a accepté », pas « la commande est PAID en base »
 * (c'est le webhook, asynchrone, qui la bascule). L'UI doit rester prudente et
 * laisser `viewerShopOrders` refléter le vrai statut.
 */
export type StripeReturnOutcome = 'paid' | 'canceled' | 'dismissed';

/** Forme minimale du retour de `openAuthSessionAsync` qu'on sait interpréter. */
export type WebBrowserAuthResult = {
  type: string;
  url?: string | null;
};

/**
 * Traduit le retour brut du navigateur intégré en résultat métier.
 *
 * Priorité au contenu de l'URL (source de vérité de Stripe) : un `canceled=1`
 * l'emporte même si `type === 'success'`, et un `paid=1` confirme le succès.
 * À défaut d'URL exploitable, on retombe sur le `type` : `success` sans marqueur
 * connu est traité comme un abandon (on ne présume jamais un paiement).
 */
export function interpretStripeReturn(
  res: WebBrowserAuthResult,
): StripeReturnOutcome {
  const url = res.url ?? '';
  if (url.includes('canceled=1')) return 'canceled';
  if (url.includes('paid=1')) return 'paid';
  if (res.type === 'success') {
    // Redirection de succès sans marqueur reconnu : on NE présume pas un
    // paiement. Le statut réel remontera via viewerShopOrders.
    return 'dismissed';
  }
  // 'cancel' (URL de cancel interceptée sans query), 'dismiss' (fermeture
  // manuelle), et tout autre type non-succès → abandon.
  return 'dismissed';
}

/**
 * Une commande n'est réglable / reprenable EN LIGNE (bouton « Payer ») que si
 * elle est EN ATTENTE ET porte une facture (`payableOnline`). Une commande
 * « réglée sur place » est PENDING mais SANS facture : le repay Stripe
 * échouerait, donc on ne propose pas « Payer », seulement « Annuler ».
 */
export function canPayShopOrder(order: {
  status: ViewerShopOrderStatus;
  payableOnline: boolean;
}): boolean {
  return order.status === 'PENDING' && order.payableOnline;
}

/**
 * Une commande peut être annulée par l'adhérent uniquement tant qu'elle est
 * EN ATTENTE et pas encore retirée. Le serveur libère alors le stock réservé.
 * PAID et CANCELLED ne sont pas annulables côté viewer, et une commande
 * remise non plus : la marchandise est partie (ADR-0017).
 */
export function canCancelShopOrder(
  status: ViewerShopOrderStatus,
  deliveredAt: string | null = null,
): boolean {
  return status === 'PENDING' && deliveredAt === null;
}

/**
 * Où en est le RETRAIT de la commande au club (ADR-0017). Le paiement et la
 * remise sont deux faits distincts : une commande payée n'est pas forcément
 * retirée, une commande retirée n'est pas forcément payée. `null` : rien à
 * dire (annulée, ou en attente non retirée).
 */
export function shopOrderPickupLabel(order: {
  status: ViewerShopOrderStatus;
  deliveredAt: string | null;
  /** Lignes de la commande ; absentes, rien n'attend l'arrivage. */
  lines?: ReadonlyArray<{ awaitingStockQty: number }>;
}):
  | { kind: 'DELIVERED'; at: string }
  | { kind: 'AWAITING_STOCK' }
  | { kind: 'TO_COLLECT' }
  | null {
  if (order.deliveredAt) return { kind: 'DELIVERED', at: order.deliveredAt };
  // Précommande (ADR-0018) : tant qu'un article attend l'arrivage, il n'y a
  // rien à retirer — payée ou non, le club ne peut pas la remettre.
  if (
    order.status !== 'CANCELLED' &&
    (order.lines ?? []).some((l) => l.awaitingStockQty > 0)
  ) {
    return { kind: 'AWAITING_STOCK' };
  }
  if (order.status === 'PAID') return { kind: 'TO_COLLECT' };
  return null;
}
