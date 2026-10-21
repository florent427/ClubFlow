import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Coordonnées exigées de toute personne qui passe par l'adhésion en ligne :
 * le compte payeur (Contact ou Member) et chaque adhérent du foyer.
 *
 * Règles posées ici, et seulement ici, pour que le portail, l'app mobile et
 * la validation du panier refusent exactement la même chose :
 *  - portable au format international E.164, de type mobile ;
 *  - adresse complète : rue, code postal, ville ;
 *  - lieu de naissance : pays (ISO 3166-1 alpha-2) et ville. Pour la France,
 *    le code INSEE de la commune vient de l'autocomplétion ; il reste
 *    facultatif pour les communes absentes du référentiel (anciennes
 *    communes fusionnées).
 *
 * L'admin reste souple : ces règles ne s'appliquent pas à ses formulaires,
 * qui affichent seulement un badge « fiche incomplète ».
 */

export const COORDINATE_GAPS = ['PHONE', 'ADDRESS', 'BIRTH_PLACE'] as const;
export type CoordinateGap = (typeof COORDINATE_GAPS)[number];

export type ContactCoordinates = {
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
};

export type BirthPlace = {
  birthCity: string | null;
  birthCityInseeCode: string | null;
  birthCountryCode: string | null;
};

const INSEE_CODE = /^(\d{5}|2[AB]\d{3})$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;

function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t ? t : null;
}

/**
 * Normalise un portable en E.164 ou renvoie null s'il n'est pas un portable
 * valide. Un numéro sans indicatif est refusé : `0692…` serait lu comme
 * français (+33 692…) et passerait pour valide, alors qu'il est réunionnais.
 */
export function normalizeMobilePhone(
  raw: string | null | undefined,
): string | null {
  const t = trimOrNull(raw);
  if (!t || !t.startsWith('+')) return null;
  const parsed = parsePhoneNumberFromString(t);
  if (!parsed || !parsed.isValid()) return null;
  const type = parsed.getType();
  // Certains plans (États-Unis, Canada…) ne distinguent pas fixe et mobile.
  if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') return null;
  return parsed.number;
}

/** Variante qui lève un message lisible : pour les écritures du portail. */
export function requireMobilePhone(
  raw: string | null | undefined,
  who?: string,
): string {
  const phone = normalizeMobilePhone(raw);
  if (!phone) {
    throw new BadRequestException(
      who
        ? `Numéro de portable invalide pour ${who} : choisissez l’indicatif du pays puis saisissez le numéro.`
        : 'Numéro de portable invalide : choisissez l’indicatif du pays puis saisissez le numéro.',
    );
  }
  return phone;
}

export function requireAddress(
  input: {
    addressLine?: string | null;
    postalCode?: string | null;
    city?: string | null;
  },
  who?: string,
): { addressLine: string; postalCode: string; city: string } {
  const addressLine = trimOrNull(input.addressLine);
  const postalCode = trimOrNull(input.postalCode);
  const city = trimOrNull(input.city);
  if (!addressLine || !postalCode || !city) {
    throw new BadRequestException(
      who
        ? `Adresse complète obligatoire pour ${who} (rue, code postal et ville).`
        : 'Adresse complète obligatoire (rue, code postal et ville).',
    );
  }
  return { addressLine, postalCode, city };
}

export function requireBirthPlace(
  input: {
    birthCity?: string | null;
    birthCityInseeCode?: string | null;
    birthCountryCode?: string | null;
  },
  who?: string,
): { birthCity: string; birthCityInseeCode: string | null; birthCountryCode: string } {
  const birthCity = trimOrNull(input.birthCity);
  const birthCountryCode = trimOrNull(input.birthCountryCode)?.toUpperCase() ?? null;
  const insee = trimOrNull(input.birthCityInseeCode)?.toUpperCase() ?? null;
  const suffix = who ? ` pour ${who}` : '';
  if (!birthCity || !birthCountryCode) {
    throw new BadRequestException(
      `Ville et pays de naissance obligatoires${suffix}.`,
    );
  }
  if (!COUNTRY_CODE.test(birthCountryCode)) {
    throw new BadRequestException(`Pays de naissance invalide${suffix}.`);
  }
  if (insee && !INSEE_CODE.test(insee)) {
    throw new BadRequestException(`Code de commune de naissance invalide${suffix}.`);
  }
  return {
    birthCity,
    // Un code INSEE n'a de sens que pour une commune française.
    birthCityInseeCode: birthCountryCode === 'FR' ? insee : null,
    birthCountryCode,
  };
}

/** Ce qui manque à une fiche, sans lever : sert au contrôle du panier. */
export function coordinateGaps(
  c: Partial<ContactCoordinates & BirthPlace>,
  opts: { requireBirthPlace: boolean },
): CoordinateGap[] {
  const gaps: CoordinateGap[] = [];
  if (!normalizeMobilePhone(c.phone)) gaps.push('PHONE');
  if (!trimOrNull(c.addressLine) || !trimOrNull(c.postalCode) || !trimOrNull(c.city)) {
    gaps.push('ADDRESS');
  }
  if (
    opts.requireBirthPlace &&
    (!trimOrNull(c.birthCity) || !trimOrNull(c.birthCountryCode))
  ) {
    gaps.push('BIRTH_PLACE');
  }
  return gaps;
}

export function coordinateGapLabelFr(gap: CoordinateGap): string {
  switch (gap) {
    case 'PHONE':
      return 'portable';
    case 'ADDRESS':
      return 'adresse';
    case 'BIRTH_PLACE':
      return 'ville de naissance';
  }
}
