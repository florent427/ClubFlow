import { describe, expect, it } from 'vitest';
import {
  canCancelShopOrder,
  canPayShopOrder,
  interpretStripeReturn,
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
  it('autorise payer + annuler UNIQUEMENT en attente (PENDING)', () => {
    expect(canPayShopOrder('PENDING')).toBe(true);
    expect(canCancelShopOrder('PENDING')).toBe(true);
  });

  it('refuse payer + annuler sur une commande payée', () => {
    expect(canPayShopOrder('PAID')).toBe(false);
    expect(canCancelShopOrder('PAID')).toBe(false);
  });

  it('refuse payer + annuler sur une commande annulée', () => {
    expect(canPayShopOrder('CANCELLED')).toBe(false);
    expect(canCancelShopOrder('CANCELLED')).toBe(false);
  });
});
