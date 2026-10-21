import { BadRequestException } from '@nestjs/common';
import {
  normalizeMobilePhone,
  requireBirthPlace,
} from '../common/coordinates/coordinates';

/**
 * Saisie des coordonnées côté admin : souple. L'admin peut enregistrer une
 * fiche incomplète (un badge « fiche incomplète » la signale), et un numéro
 * qui n'est pas un portable E.164 est gardé tel quel plutôt que refusé.
 * Les règles strictes restent celles du portail
 * (`common/coordinates/coordinates.ts`).
 */

function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

/**
 * `undefined` → champ non fourni (pas de modification) ; vide → effacé ;
 * sinon E.164 quand c'est un portable reconnu, texte brut nettoyé sinon.
 */
export function lenientAdminPhone(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw === undefined) return undefined;
  const t = trimOrNull(raw);
  if (!t) return null;
  return normalizeMobilePhone(t) ?? t;
}

/** `undefined` → non fourni ; vide → effacé ; sinon texte nettoyé. */
export function lenientAdminText(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw === undefined) return undefined;
  return trimOrNull(raw);
}

export type AdminBirthPlaceInput = {
  birthCity?: string | null;
  birthCityInseeCode?: string | null;
  birthCountryCode?: string | null;
};

export type AdminBirthPlace = {
  birthCity: string | null;
  birthCityInseeCode: string | null;
  birthCountryCode: string | null;
};

const COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * Lieu de naissance saisi par l'admin. Renvoie `undefined` si aucun des
 * trois champs n'est fourni (rien à écrire). Sinon les champs fournis
 * remplacent ceux de la fiche (`existing`) et l'ensemble est validé :
 *  - ville et pays présents → `requireBirthPlace` (pays ISO en majuscules,
 *    code INSEE vérifié et effacé hors de France) ;
 *  - tout vide → lieu effacé ;
 *  - un seul des deux → gardé tel quel (fiche incomplète, pas d'erreur),
 *    sans code INSEE ; un pays mal formé reste refusé.
 */
export function lenientAdminBirthPlace(
  input: AdminBirthPlaceInput,
  existing?: Partial<AdminBirthPlace> | null,
): AdminBirthPlace | undefined {
  if (
    input.birthCity === undefined &&
    input.birthCityInseeCode === undefined &&
    input.birthCountryCode === undefined
  ) {
    return undefined;
  }
  const pick = (k: keyof AdminBirthPlace): string | null =>
    trimOrNull(input[k] !== undefined ? input[k] : (existing?.[k] ?? null));
  const birthCity = pick('birthCity');
  const birthCountryCode = pick('birthCountryCode')?.toUpperCase() ?? null;
  const birthCityInseeCode = pick('birthCityInseeCode');
  if (!birthCity && !birthCountryCode) {
    return { birthCity: null, birthCityInseeCode: null, birthCountryCode: null };
  }
  if (birthCity && birthCountryCode) {
    return requireBirthPlace({ birthCity, birthCityInseeCode, birthCountryCode });
  }
  if (birthCountryCode && !COUNTRY_CODE.test(birthCountryCode)) {
    throw new BadRequestException('Pays de naissance invalide.');
  }
  return { birthCity, birthCityInseeCode: null, birthCountryCode };
}
