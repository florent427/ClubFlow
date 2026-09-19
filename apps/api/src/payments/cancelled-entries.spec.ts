import { withoutCancelledEntries } from './cancelled-entries';

const ligne = (
  id: string,
  amountCents: number,
  over: { refundedPaymentId?: string; cancellationReason?: string } = {},
) => ({
  id,
  amountCents,
  refundedPaymentId: over.refundedPaymentId ?? null,
  cancellationReason: over.cancellationReason ?? null,
});

describe('withoutCancelledEntries', () => {
  it('retire la saisie annulée et sa ligne d’annulation, garde le reste', () => {
    const paiements = [
      ligne('cheque-366', 36600),
      ligne('annul', -36600, {
        refundedPaymentId: 'cheque-366',
        cancellationReason: 'Montant faux',
      }),
      ligne('cheque-9150', 9150),
    ];

    expect(withoutCancelledEntries(paiements).map((p) => p.id)).toEqual([
      'cheque-9150',
    ]);
  });

  it('garde un remboursement : l’argent a bien été reçu, puis rendu', () => {
    const paiements = [
      ligne('carte', 5000),
      ligne('rembt', -2000, { refundedPaymentId: 'carte' }),
    ];

    expect(withoutCancelledEntries(paiements).map((p) => p.id)).toEqual([
      'carte',
      'rembt',
    ]);
  });

  it('sans annulation, rien ne change', () => {
    const paiements = [ligne('a', 100), ligne('b', 200)];
    expect(withoutCancelledEntries(paiements)).toEqual(paiements);
  });
});
