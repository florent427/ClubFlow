/**
 * Totaux d'encaissement d'une facture, en tenant compte des avoirs
 * (credit notes) éventuellement émis dessus.
 *
 * Convention :
 *  - **Facture standard** (`isCreditNote=false`) : son `balanceCents`
 *    représente le reste dû par le foyer. Les avoirs liés (via
 *    `parentInvoiceId`) sont déduits comme un encaissement implicite —
 *    ils représentent un crédit que le club ne réclame plus.
 *      balance = max(0, amount − paiements − avoirs liés)
 *  - **Avoir** (`isCreditNote=true`) : c'est un document de
 *    compensation. Sa "valeur" est inscrite dans `amountCents` mais
 *    son `balanceCents` est toujours **0** : le foyer ne lui doit
 *    rien (et le club non plus dans le sens facturation — un
 *    remboursement effectif passe par un Payment négatif sur la
 *    parente, pas par cet objet).
 */
export function invoicePaymentTotals(
  invoiceAmountCents: number,
  paymentsTotalCents: number,
  creditNotesTotalCents: number = 0,
  isCreditNote: boolean = false,
): {
  totalPaidCents: number;
  balanceCents: number;
  creditNotesAppliedCents: number;
} {
  const totalPaidCents = Math.max(0, paymentsTotalCents);
  const creditNotesAppliedCents = Math.max(0, creditNotesTotalCents);
  if (isCreditNote) {
    return {
      totalPaidCents,
      creditNotesAppliedCents: 0,
      balanceCents: 0,
    };
  }
  return {
    totalPaidCents,
    creditNotesAppliedCents,
    balanceCents: Math.max(
      0,
      invoiceAmountCents - totalPaidCents - creditNotesAppliedCents,
    ),
  };
}
