import { clubPaymentMethodLabel } from './payment-labels';
import type { ClubPayerCreditQueryData, ClubPaymentMethodStr } from './types';

/**
 * Crédit du payeur (ADR-0022) : saisie d'une avance au guichet. Pur, pour se
 * tester sans rendu ; l'API refait chaque contrôle.
 */

export type PayerCreditDepositMethod = Extract<
  ClubPaymentMethodStr,
  'MANUAL_CASH' | 'MANUAL_CHECK' | 'MANUAL_TRANSFER'
>;

/** Moyens qu'accepte l'API pour une avance saisie par l'admin. */
export const PAYER_CREDIT_DEPOSIT_METHODS: readonly PayerCreditDepositMethod[] = [
  'MANUAL_CASH',
  'MANUAL_CHECK',
  'MANUAL_TRANSFER',
];

/** Même plafond que l'API (`PAYER_CREDIT_DEPOSIT_MAX_CENTS`) : 10 000 €. */
export const PAYER_CREDIT_DEPOSIT_MAX_CENTS = 1_000_000;

/** Longueur maximale d'un numéro de chèque (`RecordChequeInput.number`). */
const CHEQUE_NUMBER_MAX_LENGTH = 30;

export type PayerCreditDepositForm = {
  amount: string;
  method: PayerCreditDepositMethod;
  reference: string;
  chequeDrawer: string;
  chequeBank: string;
  /** YYYY-MM-DD */
  chequeReceivedOn: string;
};

export type PayerCreditDepositInput = {
  memberId?: string;
  contactId?: string;
  amountCents: number;
  method: PayerCreditDepositMethod;
  externalRef: string | null;
  cheque?: {
    number: string | null;
    drawerName: string | null;
    bankName: string | null;
    receivedOn: string | null;
  };
};

type DepositPayment =
  ClubPayerCreditQueryData['clubPayerCredit']['deposits'][number]['payments'][number];

/** Formulaire vierge : l'émetteur d'un chèque est d'abord la personne créditée. */
export function emptyPayerCreditDepositForm(
  drawerName: string,
  today: string,
): PayerCreditDepositForm {
  return {
    amount: '',
    method: 'MANUAL_CASH',
    reference: '',
    chequeDrawer: drawerName,
    chequeBank: '',
    chequeReceivedOn: today,
  };
}

/**
 * « 50 », « 50,5 », « 1 250,00 » → centimes. `null` pour tout ce qui n'est pas
 * un montant en euros à deux décimales au plus. Calcul sur les chiffres, sans
 * multiplication flottante.
 */
export function parseEurosToCents(raw: string): number | null {
  const compact = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(compact)) return null;
  const [units, decimals = ''] = compact.split('.');
  return Number(units) * 100 + Number(decimals.padEnd(2, '0'));
}

/** Construit l'entrée de `recordPayerCreditDeposit`, ou dit ce qui manque. */
export function buildPayerCreditDepositInput(
  holder: { memberId?: string; contactId?: string },
  form: PayerCreditDepositForm,
): { input: PayerCreditDepositInput } | { error: string } {
  const amountCents = parseEurosToCents(form.amount);
  if (amountCents === null || amountCents <= 0) {
    return {
      error: 'Montant invalide : saisissez un montant en euros, par exemple 50 ou 50,00.',
    };
  }
  if (amountCents > PAYER_CREDIT_DEPOSIT_MAX_CENTS) {
    return { error: 'Une avance ne dépasse pas 10 000 €.' };
  }
  if (!PAYER_CREDIT_DEPOSIT_METHODS.includes(form.method)) {
    return { error: 'Une avance s’encaisse en espèces, par chèque ou par virement.' };
  }
  const reference = form.reference.trim() || null;
  const isCheque = form.method === 'MANUAL_CHECK';
  if (isCheque && reference && reference.length > CHEQUE_NUMBER_MAX_LENGTH) {
    return {
      error: `Le numéro de chèque tient en ${CHEQUE_NUMBER_MAX_LENGTH} caractères.`,
    };
  }

  const input: PayerCreditDepositInput = {
    ...(holder.memberId
      ? { memberId: holder.memberId }
      : { contactId: holder.contactId }),
    amountCents,
    method: form.method,
    externalRef: reference,
  };
  if (isCheque) {
    input.cheque = {
      number: reference,
      drawerName: form.chequeDrawer.trim() || null,
      bankName: form.chequeBank.trim() || null,
      receivedOn: form.chequeReceivedOn || null,
    };
  }
  return { input };
}

/**
 * Comment l'argent d'une avance est rendu, selon le moyen du versement
 * (ADR-0022, tâche 4.2 ; modèle de la boutique, ADR-0019). L'API décide ; ce
 * texte le dit avant que le trésorier confirme.
 */
export function depositRefundHowText(method: ClubPaymentMethodStr): string {
  switch (method) {
    case 'STRIPE_CARD':
      return 'L’argent est rendu à l’adhérent via Stripe, et l’avoir correspondant est émis automatiquement. Inutile d’en créer un à la main.';
    case 'MANUAL_CASH':
      return 'Rendu en espèces, depuis la caisse de l’encaissement. Le remboursement et son avoir sont enregistrés aussitôt.';
    case 'MANUAL_TRANSFER':
      return 'À rendre par virement, depuis la banque de l’encaissement. Le remboursement et son avoir sont enregistrés aussitôt : faites ensuite le virement.';
    case 'MANUAL_CHECK':
      return 'Chèque encore en portefeuille et rendu en entier : il est rendu à l’adhérent. Sinon, la somme se rend par virement, depuis la banque de sa remise ou celle du club.';
    default:
      return '';
  }
}

/** Ce que dit le tiroir après le remboursement d'une avance hors carte. */
export function depositRefundNotice(kind: string, amountLabel: string): string {
  const fait = 'le remboursement et son avoir sont enregistrés.';
  if (kind === 'CASH') return `${amountLabel} rendus en espèces : ${fait}`;
  if (kind === 'CHEQUE_RETURN') return `Chèque de ${amountLabel} rendu : ${fait}`;
  return `${amountLabel} à rendre par virement : ${fait}`;
}

/**
 * Ce qu'on peut rembourser par carte sur une avance : au plus ce qui reste
 * remboursable sur l'encaissement, et au plus le crédit encore disponible de la
 * personne. La part déjà utilisée a quitté le crédit.
 */
export function depositRefundCeilingCents(
  refundableCents: number,
  creditBalanceCents: number,
): number {
  return Math.max(0, Math.min(refundableCents, creditBalanceCents));
}

/** Montant proposé : le plus petit du reste dû et du crédit de la personne. */
export function proposedCreditApplyCents(
  invoiceBalanceCents: number,
  creditBalanceCents: number,
): number {
  return Math.max(0, Math.min(invoiceBalanceCents, creditBalanceCents));
}

/** Construit l'entrée de `applyPayerCreditToInvoice`, ou dit ce qui manque. */
export function buildApplyPayerCreditInput(args: {
  invoiceId: string;
  candidate: { memberId: string | null; contactId: string | null; balanceCents: number };
  amount: string;
  invoiceBalanceCents: number;
}):
  | { input: { invoiceId: string; memberId?: string; contactId?: string; amountCents: number } }
  | { error: string } {
  const amountCents = parseEurosToCents(args.amount);
  if (amountCents === null || amountCents <= 0) {
    return { error: 'Montant invalide : saisissez un montant en euros, par exemple 40 ou 40,00.' };
  }
  const ceilingCents = proposedCreditApplyCents(
    args.invoiceBalanceCents,
    args.candidate.balanceCents,
  );
  if (amountCents > ceilingCents) {
    return {
      error: `Au plus ${euros(ceilingCents)} : le crédit disponible et le reste dû le limitent.`,
    };
  }
  return {
    input: {
      invoiceId: args.invoiceId,
      ...(args.candidate.memberId
        ? { memberId: args.candidate.memberId }
        : { contactId: args.candidate.contactId ?? undefined }),
      amountCents,
    },
  };
}

/** « Utilisé sur « Cotisation 2026 » », ou « Rendu depuis … » pour un crédit rendu. */
export function describeCreditUse(use: { invoiceLabel: string; amountCents: number }): string {
  return use.amountCents < 0
    ? `Rendu depuis « ${use.invoiceLabel} »`
    : `Utilisé sur « ${use.invoiceLabel} »`;
}

/** Effet sur le crédit : « −40,00 € » pour une utilisation, « +40,00 € » pour un crédit rendu. */
export function creditUseAmountLabel(amountCents: number): string {
  return amountCents < 0 ? `+${euros(-amountCents)}` : `−${euros(amountCents)}`;
}

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** « Chèque · 4917496 », « Espèces » : comment l'avance a été versée. */
export function describeDepositPayments(payments: DepositPayment[]): string {
  return payments
    .map(
      (p) =>
        `${clubPaymentMethodLabel(p.method)}${p.externalRef ? ` · ${p.externalRef}` : ''}`,
    )
    .join(', ');
}
