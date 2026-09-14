import { describe, expect, it } from 'vitest';
import {
  canResendPurchaseOrder,
  purchaseTransmission,
  supplierOrderEmail,
} from './shop-purchase-transmission';

describe('supplierOrderEmail', () => {
  it('rend l’adresse nettoyée, ou null si elle manque ou ne ressemble pas à une adresse', () => {
    expect(supplierOrderEmail({ email: '  commandes@textiles.test ' })).toBe('commandes@textiles.test');
    expect(supplierOrderEmail({ email: null })).toBeNull();
    expect(supplierOrderEmail({ email: '   ' })).toBeNull();
    expect(supplierOrderEmail({ email: 'commandes@textiles' })).toBeNull();
    expect(supplierOrderEmail(null)).toBeNull();
  });
});

describe('purchaseTransmission', () => {
  it('un brouillon ne dit rien ; une commande attendue sans envoi est « non transmise »', () => {
    expect(purchaseTransmission({ status: 'DRAFT', emailedAt: null, emailedTo: null })).toBeNull();
    expect(purchaseTransmission({ status: 'ORDERED', emailedAt: null, emailedTo: null })).toEqual({
      kind: 'not-emailed',
    });
    expect(
      purchaseTransmission({ status: 'PARTIALLY_RECEIVED', emailedAt: null, emailedTo: null }),
    ).toEqual({ kind: 'not-emailed' });
  });

  it('un envoi réussi se dit, même commande close ; sans envoi, une commande close se tait', () => {
    expect(
      purchaseTransmission({ status: 'RECEIVED', emailedAt: '2026-09-14T10:00:00Z', emailedTo: 'a@b.fr' }),
    ).toEqual({ kind: 'emailed', at: '2026-09-14T10:00:00Z', to: 'a@b.fr' });
    expect(
      purchaseTransmission({ status: 'ORDERED', emailedAt: '2026-09-14T10:00:00Z', emailedTo: 'a@b.fr' }),
    ).toEqual({ kind: 'emailed', at: '2026-09-14T10:00:00Z', to: 'a@b.fr' });
    expect(purchaseTransmission({ status: 'RECEIVED', emailedAt: null, emailedTo: null })).toBeNull();
    expect(purchaseTransmission({ status: 'CANCELLED', emailedAt: null, emailedTo: null })).toBeNull();
  });
});

describe('canResendPurchaseOrder', () => {
  it('seulement une commande attendue, chez un fournisseur joignable', () => {
    const joignable = { email: 'commandes@textiles.test' };
    expect(canResendPurchaseOrder({ status: 'ORDERED', supplier: joignable })).toBe(true);
    expect(canResendPurchaseOrder({ status: 'PARTIALLY_RECEIVED', supplier: joignable })).toBe(true);
    expect(canResendPurchaseOrder({ status: 'DRAFT', supplier: joignable })).toBe(false);
    expect(canResendPurchaseOrder({ status: 'RECEIVED', supplier: joignable })).toBe(false);
    expect(canResendPurchaseOrder({ status: 'CANCELLED', supplier: joignable })).toBe(false);
    expect(canResendPurchaseOrder({ status: 'ORDERED', supplier: { email: null } })).toBe(false);
    expect(canResendPurchaseOrder({ status: 'ORDERED', supplier: null })).toBe(false);
  });
});
