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

/**
 * Peut-on annuler cette commande (bouton « Annuler ») ? Une commande REMISE ne
 * s'annule plus, même non payée : la marchandise est partie (ADR-0017). Le
 * serveur le refuse, l'écran ne le propose donc pas.
 */
export function canCancelOrder(
  status: ViewerShopOrderStatus,
  deliveredAt: string | null = null,
): boolean {
  return status === 'PENDING' && deliveredAt === null;
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

/**
 * Où en est le RETRAIT de la commande au club (ADR-0017). Le paiement et la
 * remise sont deux faits distincts : l'adhérent doit voir les deux — une
 * commande payée n'est pas forcément retirée, une commande retirée n'est pas
 * forcément payée. `null` : rien à dire (annulée, ou en attente non retirée).
 */
export function orderPickupLabel(order: {
  status: ViewerShopOrderStatus;
  deliveredAt: string | null;
}): { kind: 'DELIVERED'; at: string } | { kind: 'TO_COLLECT' } | null {
  if (order.deliveredAt) return { kind: 'DELIVERED', at: order.deliveredAt };
  if (order.status === 'PAID') return { kind: 'TO_COLLECT' };
  return null;
}
