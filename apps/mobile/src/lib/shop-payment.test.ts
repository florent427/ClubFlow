import { describe, expect, it } from 'vitest';
import {
  activeOrderLines,
  canCancelShopOrder,
  canPayShopOrder,
  interpretStripeReturn,
  shopOrderPickupLabel,
} from './shop-payment';

/**
 * Logique pure du retour de paiement. Le point sensible : ne JAMAIS présumer
 * un paiement. Seul un marqueur `paid=1` explicite vaut succès Stripe (et même
 * là, la commande n'est pas encore PAID en base — c'est le webhook).
 */
describe('interpretStripeReturn', () => {
  it('paiement accepté quand type=success et url contient paid=1', () => {
    expect(
      interpretStripeReturn({
        type: 'success',
        url: 'http://localhost:5174/boutique?club=dojo&paid=1',
      }),
    ).toBe('paid');
  });

  it('annulation quand url contient canceled=1', () => {
    expect(
      interpretStripeReturn({
        type: 'success',
        url: 'http://localhost:5174/boutique?club=dojo&canceled=1',
      }),
    ).toBe('canceled');
  });

  it('canceled=1 l’emporte même si type=success', () => {
    // Garde-fou : on lit l'URL (vérité Stripe) avant le type.
    expect(
      interpretStripeReturn({ type: 'success', url: 'x?canceled=1' }),
    ).toBe('canceled');
  });

  it('fermeture manuelle (dismiss) → dismissed', () => {
    expect(interpretStripeReturn({ type: 'dismiss' })).toBe('dismissed');
  });

  it('annulation navigateur (cancel) → dismissed', () => {
    expect(interpretStripeReturn({ type: 'cancel' })).toBe('dismissed');
  });

  it('success SANS marqueur reconnu n’est PAS présumé payé', () => {
    // On ne ment jamais sur l'état : pas de paid=1 → pas de succès.
    expect(
      interpretStripeReturn({ type: 'success', url: 'http://x/boutique' }),
    ).toBe('dismissed');
    expect(interpretStripeReturn({ type: 'success' })).toBe('dismissed');
  });
});

describe('canPayShopOrder / canCancelShopOrder', () => {
  it('« Payer » : en attente ET payable en ligne (facture présente)', () => {
    expect(canPayShopOrder({ status: 'PENDING', payableOnline: true })).toBe(
      true,
    );
    expect(canCancelShopOrder('PENDING')).toBe(true);
  });

  it('« Payer » FAUX sur une commande « sur place » (PENDING sans facture)', () => {
    // On annule toujours, mais on ne « paie » pas en ligne une commande qui
    // n'a pas de facture : le repay Stripe échouerait.
    expect(canPayShopOrder({ status: 'PENDING', payableOnline: false })).toBe(
      false,
    );
    expect(canCancelShopOrder('PENDING')).toBe(true);
  });

  it('commande payée : « Payer » seulement pour le reste à payer d’un échange (ADR-0020)', () => {
    expect(canPayShopOrder({ status: 'PAID', payableOnline: true })).toBe(true);
    expect(canPayShopOrder({ status: 'PAID', payableOnline: false })).toBe(false);
    expect(canCancelShopOrder('PAID')).toBe(false);
  });

  it('refuse payer + annuler sur une commande annulée', () => {
    expect(canPayShopOrder({ status: 'CANCELLED', payableOnline: true })).toBe(
      false,
    );
    expect(canCancelShopOrder('CANCELLED')).toBe(false);
  });
});

describe('commande retirée au club (ADR-0017)', () => {
  it('une commande en attente mais déjà retirée ne s’annule plus', () => {
    expect(canCancelShopOrder('PENDING', '2026-09-13T15:00:00.000Z')).toBe(false);
    expect(canCancelShopOrder('PENDING', null)).toBe(true);
  });

  it('retirée : la date du retrait, payée ou non', () => {
    expect(
      shopOrderPickupLabel({ status: 'PENDING', deliveredAt: '2026-09-13T15:00:00.000Z' }),
    ).toEqual({ kind: 'DELIVERED', at: '2026-09-13T15:00:00.000Z' });
  });

  it('payée mais pas retirée : à retirer au club', () => {
    expect(shopOrderPickupLabel({ status: 'PAID', deliveredAt: null })).toEqual({
      kind: 'TO_COLLECT',
    });
  });

  it('rien à dire sur une commande en attente ou annulée non retirée', () => {
    expect(shopOrderPickupLabel({ status: 'PENDING', deliveredAt: null })).toBeNull();
    expect(shopOrderPickupLabel({ status: 'CANCELLED', deliveredAt: null })).toBeNull();
  });
});

describe('commande en précommande (ADR-0018)', () => {
  const attend = [{ awaitingStockQty: 0 }, { awaitingStockQty: 1 }];

  it('un article attend l’arrivage : « en attente d’arrivage », payée ou non', () => {
    expect(
      shopOrderPickupLabel({ status: 'PAID', deliveredAt: null, lines: attend }),
    ).toEqual({ kind: 'AWAITING_STOCK' });
    expect(
      shopOrderPickupLabel({ status: 'PENDING', deliveredAt: null, lines: attend }),
    ).toEqual({ kind: 'AWAITING_STOCK' });
  });

  it('tout est arrivé : de nouveau « à retirer » une fois payée', () => {
    expect(
      shopOrderPickupLabel({
        status: 'PAID',
        deliveredAt: null,
        lines: [{ awaitingStockQty: 0 }],
      }),
    ).toEqual({ kind: 'TO_COLLECT' });
  });

  it('une commande annulée n’attend plus rien', () => {
    expect(
      shopOrderPickupLabel({ status: 'CANCELLED', deliveredAt: null, lines: attend }),
    ).toBeNull();
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
