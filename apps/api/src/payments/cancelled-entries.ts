/**
 * Les encaissements tels que le payeur les a vécus : sans les saisies annulées
 * ni leurs lignes d'annulation.
 *
 * Une saisie annulée n'a jamais été reçue. La montrer au payeur, sur sa facture
 * ou au portail (« Chèque 366 € », puis « −366 € »), lui ferait croire à un
 * remboursement. Le reste dû n'en dépend pas : la paire s'annule dans les
 * sommes. L'admin, lui, garde tout l'historique, avec qui et pourquoi.
 */
export function withoutCancelledEntries<
  P extends {
    id: string;
    amountCents: number;
    refundedPaymentId: string | null;
    cancellationReason: string | null;
  },
>(payments: readonly P[]): P[] {
  const isCancellation = (p: P) =>
    p.amountCents < 0 && !!p.cancellationReason && !!p.refundedPaymentId;
  const cancelled = new Set(
    payments.filter(isCancellation).map((p) => p.refundedPaymentId as string),
  );
  return payments.filter((p) => !isCancellation(p) && !cancelled.has(p.id));
}
