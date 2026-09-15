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

/** « Chèque · 4917496 », « Espèces » : comment l'avance a été versée. */
export function describeDepositPayments(payments: DepositPayment[]): string {
  return payments
    .map(
      (p) =>
        `${clubPaymentMethodLabel(p.method)}${p.externalRef ? ` · ${p.externalRef}` : ''}`,
    )
    .join(', ');
}
