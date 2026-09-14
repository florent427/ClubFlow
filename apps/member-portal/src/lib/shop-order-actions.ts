import type { ViewerShopOrderStatus } from './viewer-types';

/**
 * Logique PURE des actions possibles sur une commande boutique, extraite du
 * composant pour être testable sans DOM (vitest tourne en env node côté
 * portail).
 *
 * Règle métier (miroir du serveur — cf. shop-order-repay-cancel.spec.ts) : une
 * commande n'est ANNULABLE (cancel) que tant qu'elle est EN ATTENTE
 * (`PENDING`), et REPRENABLE (repay) tant qu'il y reste de l'argent dû — sa
 * facture, ou le reste à payer d'un échange d'une commande payée (ADR-0020).
 * L'UI ne propose ces boutons que là où l'appel aboutira.
 */

/**
 * Peut-on régler EN LIGNE ce qui reste dû sur cette commande (bouton « Payer ») ?
 *
 * Il faut de l'argent dû, payable en ligne (`payableOnline`), sur une commande
 * qui n'est pas annulée : en attente, sa facture ; payée, le reste à payer d'un
 * échange d'article (ADR-0020). Sans facture, le paiement en ligne échouerait :
 * on ne propose « Payer » que là où il aboutira.
 */
export function canRepayOrder(order: {
  status: ViewerShopOrderStatus;
  payableOnline: boolean;
}): boolean {
  return order.status !== 'CANCELLED' && order.payableOnline;
}

/**
 * Les articles encore dans la commande, à leur quantité restante : un article
 * annulé ou échangé par le club (ADR-0020) n'y figure plus.
 */
export function activeOrderLines<
  L extends { quantity: number; cancelledQty: number },
>(lines: ReadonlyArray<L>): L[] {
  return lines
    .filter((l) => l.quantity - l.cancelledQty > 0)
    .map((l) => ({ ...l, quantity: l.quantity - l.cancelledQty }));
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
