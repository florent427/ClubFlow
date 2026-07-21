import type { ViewerShopOrderStatus } from './viewer-types';

/**
 * Logique PURE des actions possibles sur une commande boutique, extraite du
 * composant pour être testable sans DOM (vitest tourne en env node côté
 * portail).
 *
 * Règle métier (miroir du serveur — cf. shop-order-repay-cancel.spec.ts) : une
 * commande n'est REPRENABLE (repay) et ANNULABLE (cancel) que tant qu'elle est
 * EN ATTENTE (`PENDING`). Une commande `PAID` ou `CANCELLED` n'expose aucune
 * action : `viewerRepayShopOrder` refuse « déjà payée / déjà annulée » et
 * `viewerCancelShopOrder` refuse une commande déjà payée. L'UI ne doit donc
 * proposer ces boutons QUE sur `PENDING`, faute de quoi elle inviterait à un
 * appel voué à l'erreur.
 */

/** Peut-on reprendre le paiement de cette commande (bouton « Payer ») ? */
export function canRepayOrder(status: ViewerShopOrderStatus): boolean {
  return status === 'PENDING';
}

/** Peut-on annuler cette commande (bouton « Annuler ») ? */
export function canCancelOrder(status: ViewerShopOrderStatus): boolean {
  return status === 'PENDING';
}

export type OrderStatusBadge = {
  label: string;
  cls: 'ok' | 'warn' | 'muted';
};

/** Libellé + classe de pastille lisibles pour un statut de commande. */
export function orderStatusBadge(
  status: ViewerShopOrderStatus,
): OrderStatusBadge {
  if (status === 'PAID') return { label: 'Payée', cls: 'ok' };
  if (status === 'CANCELLED') return { label: 'Annulée', cls: 'muted' };
  return { label: 'En attente', cls: 'warn' };
}
