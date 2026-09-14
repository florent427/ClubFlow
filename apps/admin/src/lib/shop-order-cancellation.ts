import type {
  ShopOrderCancellationLine,
  ShopOrderCancellationPreview,
  ShopOrderCancellationResult,
  ShopOrderRefundAction,
} from './types';

/**
 * Textes de l'annulation d'une commande boutique (ADR-0019). Le serveur calcule
 * le plan ; ces fonctions le disent à l'admin, sans rien recalculer.
 */

const euros = (cents: number) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} €`;

const cheque = (number: string | null) =>
  number ? `Chèque n° ${number}` : 'Chèque';

/** Ce que l'admin a à faire, ou ce qui se fait seul, pour un encaissement. */
export function refundLabel(action: ShopOrderRefundAction): string {
  const montant = euros(action.amountCents);
  switch (action.kind) {
    case 'CARD':
      return `Carte bancaire : ${montant} remboursés par Stripe`;
    case 'CASH':
      return `Espèces : ${montant} à rendre`;
    case 'TRANSFER':
      return `Virement : ${montant} à reverser`;
    case 'CHEQUE_RETURN':
      return `${cheque(action.chequeNumber)} (${montant}) : rendu à l’adhérent`;
    case 'CHEQUE_DEPOSITED':
      return `${cheque(action.chequeNumber)} déjà remis en banque : ${montant} à reverser par virement`;
    case 'CHEQUE_PARTIAL':
      return `${cheque(action.chequeNumber)} encore au club : ${montant} à reverser par virement, le chèque reste à remettre en banque`;
  }
}

/** L'argent, en une liste de phrases. */
export function planMoneyLines(preview: ShopOrderCancellationPreview): string[] {
  const lines = preview.refunds.map(refundLabel);
  if (preview.writeOffCents > 0) {
    lines.push(
      `Reste dû de ${euros(preview.writeOffCents)} annulé par un avoir`,
    );
  }
  if (preview.voidInvoice) {
    lines.push('Facture annulée : aucun règlement encaissé');
  }
  if (lines.length === 0) lines.push('Aucun règlement à rendre');
  return lines;
}

/** La marchandise d'une ligne : reprise, libérée, ou attente éteinte. */
export function lineGoodsLabel(line: ShopOrderCancellationLine): string {
  const parts: string[] = [];
  if (line.returnUnits > 0) {
    parts.push(`${line.returnUnits} à reprendre`);
  }
  if (line.releaseUnits > 0) {
    parts.push(
      line.releaseUnits > 1
        ? `${line.releaseUnits} réservés, libérés`
        : '1 réservé, libéré',
    );
  }
  if (line.awaitingUnits > 0) {
    parts.push(`${line.awaitingUnits} en attente d’arrivage, annulés`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Rien à reprendre';
}

/**
 * Pourquoi l'annulation ne peut pas encore être confirmée. Null : elle le peut.
 * Le serveur refuse les mêmes cas ; l'écran les dit avant le clic.
 */
export function cancelFormError(
  preview: ShopOrderCancellationPreview,
  form: { reason: string; goodsReturned: boolean },
): string | null {
  if (preview.blockers.length > 0) return preview.blockers[0];
  if (!form.reason.trim()) {
    return 'Indique le motif de l’annulation : il figure sur les avoirs.';
  }
  if (preview.delivered && !form.goodsReturned) {
    return 'Commande remise : l’adhérent doit rapporter les articles.';
  }
  return null;
}

/** Le message qui suit la confirmation. Un remboursement carte refusé se dit. */
export function cancellationToast(result: ShopOrderCancellationResult): {
  message: string;
  tone: 'success' | 'error';
} {
  const failed = result.cardRefunds.filter((r) => !r.ok);
  if (failed.length > 0) {
    const details = failed
      .map((r) => `${euros(r.amountCents)} (${r.error ?? 'erreur inconnue'})`)
      .join(', ');
    return {
      tone: 'error',
      message: `Commande annulée, mais le remboursement carte a échoué : ${details}. Relance-le depuis la facture.`,
    };
  }

  const parts = ['Commande annulée.'];
  const card = result.cardRefunds.reduce((sum, r) => sum + r.amountCents, 0);
  if (card > 0) parts.push(`Remboursement carte de ${euros(card)} lancé.`);
  if (result.manualRefundedCents > 0) {
    parts.push(`${euros(result.manualRefundedCents)} remboursés.`);
  }
  if (result.chequesReturned > 0) {
    parts.push(
      result.chequesReturned > 1
        ? `${result.chequesReturned} chèques à rendre.`
        : '1 chèque à rendre.',
    );
  }
  if (result.writtenOffCents > 0) {
    parts.push(`Reste dû de ${euros(result.writtenOffCents)} annulé.`);
  }
  if (result.invoiceVoided) parts.push('Facture annulée.');
  return { tone: 'success', message: parts.join(' ') };
}
