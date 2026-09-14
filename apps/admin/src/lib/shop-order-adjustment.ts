import { refundLabel } from './shop-order-cancellation';
import type {
  ShopOrderAdjustment,
  ShopOrderLine,
  ShopOrderLineAdjustmentPreview,
  ShopOrderLineAdjustmentResult,
  ShopProduct,
} from './types';

/**
 * Textes de l'annulation et de l'échange d'articles d'une commande boutique
 * (ADR-0020). Le serveur calcule le plan ; ces fonctions le disent à l'admin,
 * sans rien recalculer.
 */

const euros = (cents: number) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/** Unités de la ligne encore dans la commande. */
export function activeQty(
  line: Pick<ShopOrderLine, 'quantity' | 'cancelledQty'>,
): number {
  return line.quantity - line.cancelledQty;
}

/** Un article qu'on peut prendre en échange. */
export type ExchangeChoice = {
  variantId: string;
  label: string;
  unitPriceCents: number;
  /** Null : stock non suivi. */
  available: number | null;
  preorder: boolean;
};

/**
 * Les déclinaisons en vente, avec le libellé et le prix qu'une ligne de
 * commande figera — les mêmes règles que le serveur.
 */
export function exchangeChoices(products: ShopProduct[]): ExchangeChoice[] {
  return products
    .filter((p) => p.active)
    .flatMap((p) =>
      p.variants
        .filter((v) => v.active)
        .map((v) => ({
          variantId: v.id,
          label: v.label ? `${p.name} — ${v.label}` : p.name,
          unitPriceCents: v.unitPriceCents,
          available: v.trackStock ? v.available : null,
          preorder: p.preorderEnabled,
        })),
    );
}

/** Un choix de la liste : son prix, et ce qu'il en reste. */
export function exchangeChoiceLabel(choice: ExchangeChoice): string {
  const stock =
    choice.available === null
      ? ''
      : choice.available > 0
        ? ` · ${choice.available} en stock`
        : choice.preorder
          ? ' · épuisé, sur commande'
          : ' · épuisé';
  return `${choice.label} · ${euros(choice.unitPriceCents)}${stock}`;
}

/** L'argent, en une liste de phrases. */
export function adjustmentMoneyLines(
  preview: ShopOrderLineAdjustmentPreview,
): string[] {
  const lines: string[] = [];
  if (preview.supplementCents > 0) {
    lines.push(
      `Reste à payer de ${euros(preview.supplementCents)} : facture à régler en ligne ou au club`,
    );
  }
  lines.push(...preview.refunds.map(refundLabel));
  if (preview.writeOffCents > 0) {
    lines.push(`Reste dû réduit de ${euros(preview.writeOffCents)} par un avoir`);
  }
  if (preview.invoiceVoided) {
    lines.push('Facture jamais réglée : annulée');
  }
  if (preview.settlesOrder) lines.push('La commande est entièrement réglée');
  if (lines.length === 0) lines.push('Aucun mouvement d’argent');
  return lines;
}

/** La marchandise : ce qui revient, ce qui est libéré, ce qui est pris. */
export function adjustmentGoodsLines(
  preview: ShopOrderLineAdjustmentPreview,
  returnedLabel: string,
): string[] {
  const lines: string[] = [];
  if (preview.fromAwaiting > 0) {
    lines.push(
      `${returnedLabel} : ${preview.fromAwaiting} en attente d’arrivage, ${
        preview.fromAwaiting > 1 ? 'retirés' : 'retiré'
      }`,
    );
  }
  if (preview.releaseUnits > 0) {
    lines.push(
      `${returnedLabel} : ${
        preview.releaseUnits > 1
          ? `${preview.releaseUnits} réservés, libérés`
          : '1 réservé, libéré'
      }`,
    );
  }
  if (preview.returnUnits > 0) {
    lines.push(`${returnedLabel} : ${preview.returnUnits} à reprendre`);
  }
  if (preview.newItemLabel !== null) {
    const prix =
      preview.newItemUnitPriceCents !== null
        ? ` (${euros(preview.newItemUnitPriceCents)} l’unité)`
        : '';
    const attente =
      (preview.newItemAwaitingUnits ?? 0) > 0
        ? `, ${preview.newItemAwaitingUnits} en attente d’arrivage`
        : '';
    lines.push(`Pris : ${preview.newItemLabel}${prix}${attente}`);
  }
  return lines.length > 0 ? lines : ['Rien à reprendre'];
}

/**
 * Pourquoi l'ajustement ne peut pas encore être confirmé. Null : il le peut.
 * Le serveur refuse les mêmes cas ; l'écran les dit avant le clic.
 */
export function adjustFormError(
  preview: ShopOrderLineAdjustmentPreview,
  form: {
    reason: string;
    goodsReturned: boolean;
    signerName: string;
    signature: string | null;
  },
): string | null {
  if (preview.blockers.length > 0) return preview.blockers[0];
  if (preview.delivered && !form.goodsReturned) {
    return 'Commande remise : l’adhérent doit rapporter l’article.';
  }
  if (
    preview.signatureRequired &&
    (!form.signerName.trim() || form.signature === null)
  ) {
    return 'Commande remise : fais signer l’échange par l’adhérent.';
  }
  if (!form.reason.trim()) {
    return 'Indique le motif : il figure sur les avoirs.';
  }
  return null;
}

/** Le message qui suit la confirmation. Un remboursement carte refusé se dit. */
export function adjustmentToast(
  result: ShopOrderLineAdjustmentResult,
  exchange: boolean,
): { message: string; tone: 'success' | 'error' } {
  const fait = exchange ? 'Échange enregistré' : 'Article annulé';
  const failed = result.cardRefunds.filter((r) => !r.ok);
  if (failed.length > 0) {
    const details = failed
      .map((r) => `${euros(r.amountCents)} (${r.error ?? 'erreur inconnue'})`)
      .join(', ');
    return {
      tone: 'error',
      message: `${fait}, mais le remboursement carte a échoué : ${details}. Relance-le depuis la facture.`,
    };
  }

  const parts = [`${fait}.`];
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
    parts.push(`Reste dû réduit de ${euros(result.writtenOffCents)}.`);
  }
  if (result.supplementCents > 0) {
    parts.push(`Reste à payer de ${euros(result.supplementCents)} à encaisser.`);
  }
  if (result.signed) parts.push('Bon d’échange disponible.');
  return { tone: 'success', message: parts.join(' ') };
}

function supplementState(
  status: ShopOrderAdjustment['supplementInvoiceStatus'],
): string {
  if (status === 'PAID') return ' (réglé)';
  if (status === 'VOID') return ' (annulé)';
  if (status === 'OPEN') return ' (à régler)';
  return '';
}

/** Une ligne de l'historique des ajustements, sans sa date. */
export function adjustmentHistoryLabel(a: ShopOrderAdjustment): string {
  const rendu = `${a.returnedQty} × ${a.returnedLabel}`;
  const quoi =
    a.kind === 'EXCHANGE' && a.newLabel !== null
      ? `Échange : ${rendu} contre ${a.newQty ?? 1} × ${a.newLabel}`
      : `Annulation : ${rendu}`;
  const argent: string[] = [];
  if (a.differenceCents > 0) {
    argent.push(
      `reste à payer ${euros(a.differenceCents)}${supplementState(a.supplementInvoiceStatus)}`,
    );
  }
  if (a.refundedCents > 0) argent.push(`${euros(a.refundedCents)} remboursés`);
  if (a.writtenOffCents > 0) {
    argent.push(`reste dû réduit de ${euros(a.writtenOffCents)}`);
  }
  return `${[quoi, ...argent].join(' · ')}${a.reason ? ` — ${a.reason}` : ''}`;
}
