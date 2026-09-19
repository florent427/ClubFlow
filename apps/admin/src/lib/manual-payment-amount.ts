import type { ClubPaymentMethodStr } from './types';

/**
 * Montant proposé à l'ouverture d'un encaissement manuel.
 *
 * Un chèque se saisit tel qu'écrit dessus, jamais pré-rempli : un adhérent
 * règle souvent en plusieurs chèques, et le reste dû pré-rempli partait tel
 * quel. Le 2026-09-19, un chèque de 91,50 € a ainsi été enregistré à 366 €
 * en prod. Pour les espèces et le virement, le reste dû reste proposé.
 */
export function initialManualPaymentAmount(
  method: ClubPaymentMethodStr,
  balanceCents: number,
): string {
  if (method === 'MANUAL_CHECK' || balanceCents <= 0) {
    return '';
  }
  return (balanceCents / 100).toFixed(2);
}

/**
 * Montant à afficher quand le mode change : passer au chèque vide le montant
 * proposé d'office, jamais un montant saisi. Revenir aux espèces ou au
 * virement reprend le reste dû si le champ est vide.
 */
export function amountAfterMethodChange(
  current: string,
  from: ClubPaymentMethodStr,
  to: ClubPaymentMethodStr,
  balanceCents: number,
): string {
  const propose = initialManualPaymentAmount(from, balanceCents);
  if (to === 'MANUAL_CHECK') {
    return current.trim() === propose && propose !== '' ? '' : current;
  }
  if (current.trim() === '') {
    return initialManualPaymentAmount(to, balanceCents);
  }
  return current;
}

/** Montant saisi, lu en centimes ; ou le message à afficher. */
export function readManualPaymentAmount(
  raw: string,
  method: ClubPaymentMethodStr,
): { cents: number; error: null } | { cents: null; error: string } {
  const normalized = raw.replace(',', '.').trim();
  if (normalized === '') {
    return {
      cents: null,
      error:
        method === 'MANUAL_CHECK'
          ? 'Saisissez le montant du chèque, tel qu’il est écrit dessus.'
          : 'Saisissez le montant encaissé.',
    };
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(cents) || cents <= 0) {
    return { cents: null, error: 'Montant invalide.' };
  }
  return { cents, error: null };
}
