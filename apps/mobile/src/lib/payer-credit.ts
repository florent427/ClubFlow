import { formatEuroCents } from './format';
import type {
  ViewerPayerCredit,
  ViewerPayerCreditMovement,
} from './viewer-types';

/**
 * Crédit du payeur dans l'appli (ADR-0022, lot 3), mêmes règles qu'au portail
 * (`apps/member-portal/src/lib/payer-credit.ts`). Pur, pour se tester sans rendu ;
 * l'API refait chaque contrôle sous verrou.
 */

/** Libellé d'un moyen de paiement, pour l'adhérent. */
export function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'STRIPE_CARD':
      return 'Carte bancaire';
    case 'MANUAL_CASH':
      return 'Espèces';
    case 'MANUAL_CHECK':
      return 'Chèque';
    case 'MANUAL_TRANSFER':
      return 'Virement';
    case 'PAYER_CREDIT':
      return 'Crédit';
    default:
      return method;
  }
}

/**
 * Le crédit s'affiche s'il est connu, et non nul ou déjà utilisé. Une requête
 * en erreur ne donne rien à afficher : jamais « 0,00 € » à qui a du crédit.
 */
export function shouldShowPayerCredit<
  T extends Pick<ViewerPayerCredit, 'balanceCents' | 'movements'>,
>(credit: T | null | undefined): credit is T {
  return (
    credit != null &&
    (credit.balanceCents !== 0 || credit.movements.length > 0)
  );
}

/** Indicateur du solde : un crédit négatif est à régulariser auprès du club. */
export function payerCreditKpi(balanceCents: number): {
  label: string;
  value: string;
  tone: 'ok' | 'due' | 'neutral';
} {
  if (balanceCents < 0) {
    return {
      label: 'Crédit à régulariser',
      value: formatEuroCents(-balanceCents),
      tone: 'due',
    };
  }
  return {
    label: 'Crédit disponible',
    value: formatEuroCents(balanceCents),
    tone: balanceCents > 0 ? 'ok' : 'neutral',
  };
}

/**
 * Ce que « Utiliser mon crédit » réglerait sur cette facture : le plus petit
 * du reste dû et du crédit. 0 quand il n'y a rien à régler ou pas de crédit
 * positif : le bouton ne s'affiche pas.
 */
export function payerCreditApplyCents(
  invoice: { status: string; balanceCents: number },
  creditBalanceCents: number | null | undefined,
): number {
  if (invoice.status !== 'OPEN' || creditBalanceCents == null) return 0;
  return Math.max(0, Math.min(invoice.balanceCents, creditBalanceCents));
}

/** Ce que l'adhérent confirme avant d'utiliser son crédit. */
export function payerCreditApplyConfirmation(args: {
  invoiceLabel: string;
  applyCents: number;
  invoiceBalanceCents: number;
  creditBalanceCents: number;
}): string {
  const reste = args.invoiceBalanceCents - args.applyCents;
  const facture =
    reste > 0
      ? `il restera ${formatEuroCents(reste)} à payer`
      : 'la facture sera soldée';
  return (
    `${formatEuroCents(args.applyCents)} de « ${args.invoiceLabel} » seront réglés avec votre crédit : ` +
    `${facture}, et votre crédit passera à ${formatEuroCents(args.creditBalanceCents - args.applyCents)}.`
  );
}

/** Titre d'une ligne de l'historique du crédit. */
export function payerCreditMovementTitle(
  movement: Pick<ViewerPayerCreditMovement, 'kind' | 'label' | 'method'>,
): string {
  switch (movement.kind) {
    case 'DEPOSIT':
      return movement.method
        ? `Avance versée · ${paymentMethodLabel(movement.method)}`
        : 'Avance versée';
    case 'DEPOSIT_REFUND':
      return 'Avance remboursée';
    case 'USE':
      return `Utilisé pour « ${movement.label} »`;
    case 'USE_RETURN':
      return `Rendu depuis « ${movement.label} »`;
    default:
      // Un mouvement que cette version de l'appli ne connaît pas encore.
      return movement.label;
  }
}

/** « Créditer mon compte » par carte : de 1 € à 1 000 €, comme l'API. */
export const PAYER_CREDIT_TOP_UP_MIN_CENTS = 100;
export const PAYER_CREDIT_TOP_UP_MAX_CENTS = 100_000;

/**
 * Montant saisi pour créditer son compte : « 50 », « 50,5 », « 1 000,00 ».
 * Calcul sur les chiffres, sans multiplication flottante.
 */
export function parsePayerCreditTopUp(
  raw: string,
): { cents: number } | { error: string } {
  const compact = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(compact)) {
    return { error: 'Saisissez un montant en euros, par exemple 50 ou 50,00.' };
  }
  const [units, decimals = ''] = compact.split('.');
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  if (cents < PAYER_CREDIT_TOP_UP_MIN_CENTS || cents > PAYER_CREDIT_TOP_UP_MAX_CENTS) {
    return { error: 'Le montant va de 1 € à 1 000 €.' };
  }
  return { cents };
}

/** « +50,00 € » ou « −30,00 € » : l'effet d'un mouvement sur le crédit. */
export function signedEuroCents(cents: number): string {
  if (cents > 0) return `+${formatEuroCents(cents)}`;
  if (cents < 0) return `−${formatEuroCents(-cents)}`;
  return formatEuroCents(0);
}
