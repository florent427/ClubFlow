import { describe, expect, it } from 'vitest';
import { computeRefundableByPaymentId } from './refundable-payments';
import type { ClubInvoiceDetailQueryData } from './types';

type InvoicePayment =
  ClubInvoiceDetailQueryData['clubInvoice']['payments'][number];

function payment(over: Partial<InvoicePayment> & { id: string }): InvoicePayment {
  return {
    amountCents: 10000,
    method: 'STRIPE_CARD',
    externalRef: 'pi_123',
    paidByFirstName: null,
    paidByLastName: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    refundedPaymentId: null,
    ...over,
  };
}

describe('computeRefundableByPaymentId', () => {
  it('rend le montant entier tant que rien n’a été remboursé', () => {
    const map = computeRefundableByPaymentId([payment({ id: 'pay-1' })]);
    expect(map.get('pay-1')).toBe(10000);
  });

  it('déduit un remboursement partiel déjà enregistré', () => {
    const map = computeRefundableByPaymentId([
      payment({ id: 'pay-1' }),
      payment({
        id: 'refund-1',
        amountCents: -3000,
        externalRef: 're_1',
        refundedPaymentId: 'pay-1',
      }),
    ]);
    // 100 € encaissés, 30 € rendus : c'est le cas où une erreur de signe ou
    // d'agrégation se voit. Un encaissement intact ne prouverait rien.
    expect(map.get('pay-1')).toBe(7000);
  });

  it('cumule plusieurs remboursements partiels jusqu’à épuisement', () => {
    const map = computeRefundableByPaymentId([
      payment({ id: 'pay-1' }),
      payment({
        id: 'refund-1',
        amountCents: -4000,
        externalRef: 're_1',
        refundedPaymentId: 'pay-1',
      }),
      payment({
        id: 'refund-2',
        amountCents: -6000,
        externalRef: 're_2',
        refundedPaymentId: 'pay-1',
      }),
    ]);
    expect(map.get('pay-1')).toBe(0);
  });

  it('n’impute un remboursement qu’à l’encaissement qu’il désigne', () => {
    const map = computeRefundableByPaymentId([
      payment({ id: 'pay-1' }),
      payment({ id: 'pay-2', externalRef: 'pi_456', amountCents: 5000 }),
      payment({
        id: 'refund-1',
        amountCents: -2000,
        externalRef: 're_1',
        refundedPaymentId: 'pay-2',
      }),
    ]);
    expect(map.get('pay-1')).toBe(10000);
    expect(map.get('pay-2')).toBe(3000);
  });

  it('exclut les encaissements que l’API refuserait de rembourser', () => {
    const map = computeRefundableByPaymentId([
      payment({ id: 'cash', method: 'MANUAL_CASH', externalRef: null }),
      payment({ id: 'cheque', method: 'MANUAL_CHECK', externalRef: 'CH-42' }),
      // Encaissement carte sans référence de PaymentIntent exploitable :
      // l'API le rejette, le bouton ne doit pas apparaître.
      payment({ id: 'sans-pi', externalRef: 'ch_789' }),
      payment({ id: 'sans-ref', externalRef: null }),
    ]);
    expect(map.size).toBe(0);
  });

  it('n’expose jamais une ligne de remboursement comme remboursable', () => {
    const map = computeRefundableByPaymentId([
      payment({
        id: 'refund-orphelin',
        amountCents: -3000,
        externalRef: 'pi_123',
        refundedPaymentId: null,
      }),
    ]);
    expect(map.has('refund-orphelin')).toBe(false);
  });
});
