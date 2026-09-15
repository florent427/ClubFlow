import { describe, expect, it } from 'vitest';
import { invoicePdfFilename } from './invoice-pdf-download';

describe('invoicePdfFilename', () => {
  const id = 'abcd1234-0000-0000-0000-000000000000';

  it('nomme le document selon ce qu’il est', () => {
    expect(invoicePdfFilename({ id, isCreditNote: false, purpose: 'CHARGE' })).toBe(
      'Facture_ABCD1234.pdf',
    );
    expect(invoicePdfFilename({ id, isCreditNote: true, purpose: 'CHARGE' })).toBe(
      'Avoir_ABCD1234.pdf',
    );
    expect(
      invoicePdfFilename({ id, isCreditNote: false, purpose: 'PAYER_CREDIT_DEPOSIT' }),
    ).toBe('Recu_avance_ABCD1234.pdf');
  });
});
