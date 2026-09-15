import type { ClubPaymentMethodStr } from './types';

const LABELS: Record<ClubPaymentMethodStr, string> = {
  STRIPE_CARD: 'Carte bancaire (Stripe)',
  MANUAL_CASH: 'Espèces',
  MANUAL_CHECK: 'Chèque',
  MANUAL_TRANSFER: 'Virement',
  PAYER_CREDIT: 'Crédit',
};

/** Moyens qu'un tarif ou un verrou peut viser : le crédit n'en fait pas partie (ADR-0022). */
export const ALL_CLUB_PAYMENT_METHODS: ClubPaymentMethodStr[] = [
  'STRIPE_CARD',
  'MANUAL_CASH',
  'MANUAL_CHECK',
  'MANUAL_TRANSFER',
];

/** Encaissement saisi par le trésorier (hors webhook Stripe). */
export const CLUB_MANUAL_PAYMENT_METHODS: ClubPaymentMethodStr[] = [
  'MANUAL_CASH',
  'MANUAL_CHECK',
  'MANUAL_TRANSFER',
];

export function clubPaymentMethodLabel(m: ClubPaymentMethodStr): string {
  return LABELS[m] ?? m;
}
