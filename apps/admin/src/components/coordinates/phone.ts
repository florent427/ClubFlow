import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Pays deviné pour un ancien numéro saisi sans indicatif. `0692…` lu comme
 * français donnerait `+33 692…` : faux. Préfixes réunionnais (mobiles 0692 /
 * 0693, fixes 0262) et mahorais (mobile 0639, fixe 0269) d'abord.
 */
export function guessLegacyPhoneCountry(raw: string): CountryCode {
  const digits = raw.replace(/\D/g, '');
  if (/^0(692|693|262)/.test(digits)) return 'RE';
  if (/^0(639|269)/.test(digits)) return 'YT';
  return 'FR';
}

/**
 * Valeur E.164 à afficher dans le sélecteur pour une valeur stockée :
 * telle quelle si elle commence par `+`, sinon devinée à partir de
 * l'ancien format national. `null` si rien d'exploitable.
 */
export function phoneToE164Guess(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (t.startsWith('+')) {
    return parsePhoneNumberFromString(t)?.number ?? t.replace(/[^\d+]/g, '');
  }
  const parsed = parsePhoneNumberFromString(t, guessLegacyPhoneCountry(t));
  return parsed?.number ?? null;
}

/**
 * Valeur envoyée à l'API : ce qui est affiché. Un ancien numéro reconnu
 * part en E.164, un texte inexploitable est gardé tel quel (admin souple).
 */
export function phoneForSave(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return phoneToE164Guess(t) ?? t;
}
