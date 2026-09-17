import type { ClubPaymentMethod } from '@prisma/client';
import type { PayerCreditBalance } from './payer-credit-balance';

/** Ce qui fait bouger un crédit (ADR-0022). */
export enum PayerCreditMovementKind {
  /** Avance versée. */
  DEPOSIT = 'DEPOSIT',
  /** Avance remboursée : paiement négatif sur le reçu. */
  DEPOSIT_REFUND = 'DEPOSIT_REFUND',
  /** Crédit utilisé pour régler une facture. */
  USE = 'USE',
  /** Crédit rendu par un avoir ou une annulation boutique. */
  USE_RETURN = 'USE_RETURN',
}

export type PayerCreditMovement = {
  /** Le paiement qui fait le mouvement. */
  paymentId: string;
  kind: PayerCreditMovementKind;
  /** Libellé du reçu d'avance, ou de la facture réglée. */
  label: string;
  /** Moyen de versement d'une avance ; `null` pour une utilisation. */
  method: ClubPaymentMethod | null;
  /** Effet sur le crédit : positif s'il l'augmente, négatif s'il le diminue. */
  amountCents: number;
  createdAt: Date;
};

/**
 * L'historique d'un crédit, un paiement par ligne, du plus récent au plus
 * ancien. Chaque montant porte son effet sur le crédit : la somme des lignes
 * est le solde que calcule `readPayerCredit`.
 */
export function payerCreditMovements(
  credit: Pick<PayerCreditBalance, 'deposits' | 'uses'>,
): PayerCreditMovement[] {
  const fromDeposits = credit.deposits.flatMap((deposit) =>
    deposit.payments.map((payment) => ({
      paymentId: payment.id,
      kind:
        payment.amountCents < 0
          ? PayerCreditMovementKind.DEPOSIT_REFUND
          : PayerCreditMovementKind.DEPOSIT,
      label: deposit.label,
      method: payment.method,
      amountCents: payment.amountCents,
      createdAt: payment.createdAt,
    })),
  );
  // Une utilisation diminue le crédit ; un crédit rendu, négatif, l'augmente.
  const fromUses = credit.uses.map((use) => ({
    paymentId: use.paymentId,
    kind:
      use.amountCents < 0
        ? PayerCreditMovementKind.USE_RETURN
        : PayerCreditMovementKind.USE,
    label: use.invoiceLabel,
    method: null,
    amountCents: -use.amountCents,
    createdAt: use.createdAt,
  }));
  return [...fromDeposits, ...fromUses].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.paymentId.localeCompare(b.paymentId),
  );
}
