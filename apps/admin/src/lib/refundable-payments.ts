import type { ClubInvoiceDetailQueryData } from './types';

type InvoicePayment =
  ClubInvoiceDetailQueryData['clubInvoice']['payments'][number];

/**
 * Solde encore remboursable de chaque encaissement, en centimes.
 *
 * Un remboursement se matérialise en base par un Payment NÉGATIF portant
 * `refundedPaymentId` : on le soustrait de l'encaissement d'origine. Seuls
 * les encaissements que l'API accepte réellement de rembourser entrent dans
 * la table — carte Stripe, montant positif, référence de PaymentIntent
 * exploitable — pour ne pas proposer une action vouée à échouer.
 *
 * ⚠️ Cette vue peut être en retard de quelques secondes sur Stripe : les
 * lignes négatives ne sont écrites qu'au retour du webhook `charge.refunded`.
 * C'est l'API qui fait autorité sur le montant réellement remboursable ; ce
 * calcul ne sert qu'à cadrer la saisie.
 */
export function computeRefundableByPaymentId(
  payments: readonly InvoicePayment[],
): Map<string, number> {
  const refundable = new Map<string, number>();

  for (const p of payments) {
    if (
      p.amountCents > 0 &&
      p.method === 'STRIPE_CARD' &&
      p.externalRef?.startsWith('pi_')
    ) {
      refundable.set(p.id, p.amountCents);
    }
  }

  for (const p of payments) {
    if (p.amountCents >= 0 || !p.refundedPaymentId) continue;
    const remaining = refundable.get(p.refundedPaymentId);
    if (remaining === undefined) continue;
    refundable.set(p.refundedPaymentId, remaining + p.amountCents);
  }

  return refundable;
}
