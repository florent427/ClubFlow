import type { ClubInvoiceDetailQueryData } from './types';

type InvoiceDetail = ClubInvoiceDetailQueryData['clubInvoice'];
type InvoicePayment = InvoiceDetail['payments'][number];

const MANUAL = new Set(['MANUAL_CASH', 'MANUAL_CHECK', 'MANUAL_TRANSFER']);

/**
 * « Annuler la saisie » est proposé pour un encaissement saisi à la main,
 * encore entier, sur une facture ordinaire. Une avance se rembourse depuis son
 * reçu, une commande boutique s'annule avec la commande, une carte se
 * rembourse : ne pas proposer une action que l'API refusera.
 *
 * L'API reste juge : un chèque remis en banque, une recette verrouillée ou
 * rapprochée sont refusés avec leur motif.
 */
export function canCancelManualPayment(
  invoice: Pick<InvoiceDetail, 'purpose' | 'isCreditNote' | 'shopOrderId'>,
  payment: InvoicePayment,
  payments: readonly InvoicePayment[],
): boolean {
  if (invoice.purpose !== 'CHARGE' || invoice.isCreditNote || invoice.shopOrderId) {
    return false;
  }
  if (!MANUAL.has(payment.method) || payment.amountCents <= 0) {
    return false;
  }
  // Déjà annulé ou remboursé : une ligne négative le désigne.
  return !payments.some(
    (p) => p.amountCents < 0 && p.refundedPaymentId === payment.id,
  );
}

/** Une ligne négative qui annule une saisie, et non un remboursement. */
export function isCancellationLine(payment: InvoicePayment): boolean {
  return payment.amountCents < 0 && !!payment.cancellationReason;
}
