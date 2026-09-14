import { describe, expect, it } from 'vitest';
import {
  activeOrderLines,
  canCancelOrder,
  canPayOnSiteAtCheckout,
  canRepayOrder,
  orderPickupLabel,
  orderStatusBadge,
} from './shop-order-actions';
import type { ViewerShopOrderStatus } from './viewer-types';

const STATUSES: ViewerShopOrderStatus[] = ['PENDING', 'PAID', 'CANCELLED'];

describe('canRepayOrder — il reste de l’argent dû, payable en ligne', () => {
  it('en attente avec sa facture, ou payée avec le reste à payer d’un échange (ADR-0020)', () => {
    expect(canRepayOrder({ status: 'PENDING', payableOnline: true })).toBe(true);
    expect(canRepayOrder({ status: 'PAID', payableOnline: true })).toBe(true);
  });

  it('jamais sur une commande annulée', () => {
    expect(canRepayOrder({ status: 'CANCELLED', payableOnline: true })).toBe(
      false,
    );
  });

  it('FAUX quand rien n’est payable en ligne : « sur place » sans facture, ou tout réglé', () => {
    // Sans argent dû payable en ligne, le repay Stripe échouerait — on ne
    // propose donc pas « Payer ».
    expect(canRepayOrder({ status: 'PENDING', payableOnline: false })).toBe(
      false,
    );
    expect(canRepayOrder({ status: 'PAID', payableOnline: false })).toBe(false);
  });
});

describe('canCancelOrder — annulation réservée au PENDING', () => {
  it('vrai uniquement pour PENDING', () => {
    expect(canCancelOrder('PENDING')).toBe(true);
    expect(canCancelOrder('PAID')).toBe(false);
    expect(canCancelOrder('CANCELLED')).toBe(false);
  });

  it('aucune annulation sur une commande finale', () => {
    for (const s of STATUSES.filter((x) => x !== 'PENDING')) {
      expect(canCancelOrder(s)).toBe(false);
    }
  });
});

describe('activeOrderLines — les articles encore dans la commande (ADR-0020)', () => {
  const ligne = (quantity: number, cancelledQty: number) => ({
    id: `l-${quantity}-${cancelledQty}`,
    label: 'T-shirt — L',
    quantity,
    cancelledQty,
  });

  it('à leur quantité restante, sans les articles entièrement retirés', () => {
    expect(activeOrderLines([ligne(3, 1), ligne(1, 1), ligne(2, 0)])).toEqual([
      { ...ligne(3, 1), quantity: 2 },
      ligne(2, 0),
    ]);
  });
});

describe('canPayOnSiteAtCheckout — « Régler sur place » réservé à la validation du panier', () => {
  it('vrai à la validation du panier (aucun orderId)', () => {
    expect(canPayOnSiteAtCheckout()).toBe(true);
    expect(canPayOnSiteAtCheckout(undefined)).toBe(true);
    expect(canPayOnSiteAtCheckout(null)).toBe(true);
  });

  it('faux en reprise de paiement (une commande est visée)', () => {
    // Mode repay : la modale reçoit l'id de la commande PENDING à repayer.
    // Le règlement sur place n'a alors aucun sens (la commande existe déjà).
    expect(canPayOnSiteAtCheckout('order_123')).toBe(false);
  });
});

describe('orderStatusBadge — libellé lisible par statut', () => {
  it('mappe chaque statut sur un libellé FR et une classe', () => {
    expect(orderStatusBadge('PENDING')).toEqual({
      label: 'En attente',
      cls: 'warn',
    });
    expect(orderStatusBadge('PAID')).toEqual({ label: 'Payée', cls: 'ok' });
    expect(orderStatusBadge('CANCELLED')).toEqual({
      label: 'Annulée',
      cls: 'muted',
    });
  });

  it('couvre tous les statuts sans retomber sur un défaut ambigu', () => {
    for (const s of STATUSES) {
      const b = orderStatusBadge(s);
      expect(b.label.length).toBeGreaterThan(0);
      expect(['ok', 'warn', 'muted']).toContain(b.cls);
    }
  });
});

describe('canCancelOrder — une commande remise ne s’annule plus (ADR-0017)', () => {
  it('une commande en attente mais déjà retirée n’est plus annulable', () => {
    expect(canCancelOrder('PENDING', '2026-09-13T15:00:00.000Z')).toBe(false);
    expect(canCancelOrder('PENDING', null)).toBe(true);
  });
});

describe('orderPickupLabel — le retrait, distinct du paiement (ADR-0017)', () => {
  it('retirée : la date du retrait, que la commande soit payée ou non', () => {
    expect(
      orderPickupLabel({ status: 'PENDING', deliveredAt: '2026-09-13T15:00:00.000Z' }),
    ).toEqual({ kind: 'DELIVERED', at: '2026-09-13T15:00:00.000Z' });
    expect(
      orderPickupLabel({ status: 'PAID', deliveredAt: '2026-09-13T15:00:00.000Z' }),
    ).toEqual({ kind: 'DELIVERED', at: '2026-09-13T15:00:00.000Z' });
  });

  it('payée mais pas retirée : à retirer au club', () => {
    expect(orderPickupLabel({ status: 'PAID', deliveredAt: null })).toEqual({
      kind: 'TO_COLLECT',
    });
  });

  it('rien à dire sur une commande en attente ou annulée non retirée', () => {
    expect(orderPickupLabel({ status: 'PENDING', deliveredAt: null })).toBeNull();
    expect(orderPickupLabel({ status: 'CANCELLED', deliveredAt: null })).toBeNull();
  });
});

describe('orderPickupLabel — précommande (ADR-0018)', () => {
  const attend = [{ awaitingStockQty: 0 }, { awaitingStockQty: 1 }];

  it('un article attend l’arrivage : « en attente d’arrivage », payée ou non', () => {
    expect(
      orderPickupLabel({ status: 'PAID', deliveredAt: null, lines: attend }),
    ).toEqual({ kind: 'AWAITING_STOCK' });
    expect(
      orderPickupLabel({ status: 'PENDING', deliveredAt: null, lines: attend }),
    ).toEqual({ kind: 'AWAITING_STOCK' });
  });

  it('tout est arrivé : de nouveau « à retirer » une fois payée', () => {
    expect(
      orderPickupLabel({
        status: 'PAID',
        deliveredAt: null,
        lines: [{ awaitingStockQty: 0 }],
      }),
    ).toEqual({ kind: 'TO_COLLECT' });
  });

  it('une commande annulée n’attend plus rien', () => {
    expect(
      orderPickupLabel({ status: 'CANCELLED', deliveredAt: null, lines: attend }),
    ).toBeNull();
  });
});
