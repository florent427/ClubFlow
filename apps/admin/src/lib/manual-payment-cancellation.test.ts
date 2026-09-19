import { describe, expect, it } from 'vitest';
import {
  canCancelManualPayment,
  isCancellationLine,
} from './manual-payment-cancellation';
import type { ClubInvoiceDetailQueryData } from './types';

type InvoicePayment =
  ClubInvoiceDetailQueryData['clubInvoice']['payments'][number];

const facture = {
  purpose: 'CHARGE' as const,
  isCreditNote: false,
  shopOrderId: null,
};

function payment(over: Partial<InvoicePayment> & { id: string }): InvoicePayment {
  return {
    amountCents: 36600,
    method: 'MANUAL_CHECK',
    externalRef: '5704017',
    paidByFirstName: null,
    paidByLastName: null,
    recordedByName: 'Florent Morel',
    cancellationReason: null,
    createdAt: '2026-09-19T06:25:48.000Z',
    refundedPaymentId: null,
    ...over,
  };
}

describe('canCancelManualPayment', () => {
  it('propose l’annulation d’un chèque saisi à la main', () => {
    const cheque = payment({ id: 'pay-1' });
    expect(canCancelManualPayment(facture, cheque, [cheque])).toBe(true);
  });

  it('pas deux fois : une ligne d’annulation désigne déjà l’encaissement', () => {
    const cheque = payment({ id: 'pay-1' });
    const annulation = payment({
      id: 'pay-2',
      amountCents: -36600,
      refundedPaymentId: 'pay-1',
      cancellationReason: 'Montant faux',
    });
    expect(canCancelManualPayment(facture, cheque, [cheque, annulation])).toBe(false);
    expect(canCancelManualPayment(facture, annulation, [cheque, annulation])).toBe(false);
  });

  it('ni une carte, ni une avance, ni une commande boutique', () => {
    const carte = payment({ id: 'pay-1', method: 'STRIPE_CARD' });
    expect(canCancelManualPayment(facture, carte, [carte])).toBe(false);

    const cheque = payment({ id: 'pay-2' });
    expect(
      canCancelManualPayment(
        { ...facture, purpose: 'PAYER_CREDIT_DEPOSIT' },
        cheque,
        [cheque],
      ),
    ).toBe(false);
    expect(
      canCancelManualPayment({ ...facture, shopOrderId: 'order-1' }, cheque, [cheque]),
    ).toBe(false);
  });
});

describe('isCancellationLine', () => {
  it('reconnaît une annulation à son motif, pas un remboursement', () => {
    expect(
      isCancellationLine(
        payment({ id: 'a', amountCents: -100, refundedPaymentId: 'x', cancellationReason: 'Erreur' }),
      ),
    ).toBe(true);
    expect(
      isCancellationLine(payment({ id: 'r', amountCents: -100, refundedPaymentId: 'x' })),
    ).toBe(false);
    expect(isCancellationLine(payment({ id: 'p' }))).toBe(false);
  });
});
