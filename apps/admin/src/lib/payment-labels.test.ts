import { describe, expect, it } from 'vitest';
import {
  ALL_CLUB_PAYMENT_METHODS,
  CLUB_MANUAL_PAYMENT_METHODS,
  clubPaymentMethodLabel,
} from './payment-labels';

describe('moyens de paiement', () => {
  it('nomme le règlement par crédit', () => {
    expect(clubPaymentMethodLabel('PAYER_CREDIT')).toBe('Crédit');
  });

  it('ne propose le crédit ni pour un tarif ou un verrou, ni pour une saisie manuelle', () => {
    // Le crédit s'impute depuis la facture : le proposer ailleurs ferait
    // entrer de l'argent qui n'existe pas (ADR-0022).
    expect(ALL_CLUB_PAYMENT_METHODS).not.toContain('PAYER_CREDIT');
    expect(CLUB_MANUAL_PAYMENT_METHODS).not.toContain('PAYER_CREDIT');
  });
});
