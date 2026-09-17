import { ClubPaymentMethod } from '@prisma/client';
import { PayerCreditMovementKind, payerCreditMovements } from './payer-credit-movements';

const le = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00Z`);

describe('payerCreditMovements — l’historique d’un crédit (ADR-0022)', () => {
  it('une avance remboursée en partie compte deux lignes, et la somme des lignes reste le crédit', () => {
    // Remboursement d'avance (lot 4) : un paiement négatif sur le reçu.
    const credit = {
      deposits: [
        {
          invoiceId: 'recu-1',
          label: 'Avance — Paul Payeur',
          createdAt: le(1),
          amountCents: 3000,
          payments: [
            { id: 'p-1', amountCents: 5000, method: ClubPaymentMethod.MANUAL_TRANSFER, externalRef: 'VIR 12', createdAt: le(1) },
            { id: 'p-3', amountCents: -2000, method: ClubPaymentMethod.MANUAL_TRANSFER, externalRef: null, createdAt: le(9) },
          ],
        },
      ],
      uses: [
        { paymentId: 'p-2', invoiceId: 'f-1', invoiceLabel: 'Cotisation 2026', amountCents: 1000, createdAt: le(5) },
      ],
    };

    const lignes = payerCreditMovements(credit);

    expect(lignes).toEqual([
      {
        paymentId: 'p-3',
        kind: PayerCreditMovementKind.DEPOSIT_REFUND,
        label: 'Avance — Paul Payeur',
        method: ClubPaymentMethod.MANUAL_TRANSFER,
        amountCents: -2000,
        createdAt: le(9),
      },
      {
        paymentId: 'p-2',
        kind: PayerCreditMovementKind.USE,
        label: 'Cotisation 2026',
        method: null,
        amountCents: -1000,
        createdAt: le(5),
      },
      {
        paymentId: 'p-1',
        kind: PayerCreditMovementKind.DEPOSIT,
        label: 'Avance — Paul Payeur',
        method: ClubPaymentMethod.MANUAL_TRANSFER,
        amountCents: 5000,
        createdAt: le(1),
      },
    ]);
    const deposited = credit.deposits.reduce((s, d) => s + d.amountCents, 0);
    const used = credit.uses.reduce((s, u) => s + u.amountCents, 0);
    expect(lignes.reduce((s, l) => s + l.amountCents, 0)).toBe(deposited - used);
  });

  it('au même instant, l’ordre ne dépend pas de l’ordre de lecture', () => {
    const use = (paymentId: string) => ({
      paymentId,
      invoiceId: 'f-1',
      invoiceLabel: 'Cotisation 2026',
      amountCents: 500,
      createdAt: le(3),
    });

    const a = payerCreditMovements({ deposits: [], uses: [use('p-b'), use('p-a')] });
    const b = payerCreditMovements({ deposits: [], uses: [use('p-a'), use('p-b')] });

    expect(a.map((l) => l.paymentId)).toEqual(['p-a', 'p-b']);
    expect(b.map((l) => l.paymentId)).toEqual(['p-a', 'p-b']);
  });
});
