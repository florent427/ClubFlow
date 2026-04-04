/** Totaux d’encaissement pour une facture (somme des paiements enregistrés). */
export function invoicePaymentTotals(
  invoiceAmountCents: number,
  paymentsTotalCents: number,
): { totalPaidCents: number; balanceCents: number } {
  const totalPaidCents = Math.max(0, paymentsTotalCents);
  return {
    totalPaidCents,
    balanceCents: Math.max(0, invoiceAmountCents - totalPaidCents),
  };
}
