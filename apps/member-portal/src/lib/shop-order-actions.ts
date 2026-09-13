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

/**
 * Peut-on reprendre le paiement EN LIGNE de cette commande (bouton « Payer ») ?
 *
 * Deux conditions : la commande est EN ATTENTE, ET elle porte une facture
 * (`payableOnline`). Une commande « réglée sur place » est PENDING mais SANS
 * facture — le repay Stripe échouerait. On ne propose donc « Payer » que là où
 * il aboutira ; « Annuler », lui, reste offert sur toute commande en attente.
 */
export function canRepayOrder(order: {
  status: ViewerShopOrderStatus;
  payableOnline: boolean;
}): boolean {
  return order.status === 'PENDING' && order.payableOnline;
}

/** Peut-on annuler cette commande (bouton « Annuler ») ? */
export function canCancelOrder(status: ViewerShopOrderStatus): boolean {
  return status === 'PENDING';
}

/**
 * Peut-on proposer « Régler sur place » dans la modale de règlement ?
 *
 * Oui UNIQUEMENT à la validation du panier, jamais à la reprise de paiement
 * d'une commande déjà passée. Deux raisons concordantes : `viewerCheckout
 * ShopCartOnSite` opère sur le panier courant et non sur une
 * commande précise ; et une commande PENDING a déjà arbitré son mode à sa
 * création — la reprise ne concerne que le paiement Stripe de sa facture. La
 * modale distingue les deux cas par la présence d'un `orderId` (mode repay).
 */
export function canPayOnSiteAtCheckout(orderId?: string | null): boolean {
  return orderId == null;
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
