import { gql } from '@apollo/client';
import {
  getCountries,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

/**
 * Coordonnées exigées à l'adhésion en ligne (cf.
 * docs/superpowers/plans/2026-10-21-coordonnees-obligatoires.md). Les règles
 * font foi côté API (`common/coordinates`) ; celles-ci n'existent que pour
 * guider la saisie avant l'aller-retour.
 */

export type Coordinates = {
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  birthCity: string | null;
  birthCityInseeCode: string | null;
  birthCountryCode: string | null;
};

export type CoordinatesTarget = 'ACCOUNT' | 'PENDING_ITEM' | 'MEMBER';
export type CoordinateGap = 'PHONE' | 'ADDRESS' | 'BIRTH_PLACE';

export type CoordinatesGap = {
  target: CoordinatesTarget;
  targetId: string | null;
  displayName: string;
  missing: CoordinateGap[];
  requiresBirthPlace: boolean;
  current: Coordinates;
};

export type CoordinatesStatus = {
  account: Coordinates;
  accountComplete: boolean;
  gaps: CoordinatesGap[];
};

export type AddressValue = {
  addressLine: string;
  postalCode: string;
  city: string;
};

export type BirthPlaceValue = {
  birthCity: string;
  birthCityInseeCode: string | null;
  birthCountryCode: string;
};

const COORDINATES_FIELDS = `
  phone
  addressLine
  postalCode
  city
  birthCity
  birthCityInseeCode
  birthCountryCode
`;

const STATUS_FIELDS = `
  accountComplete
  account { ${COORDINATES_FIELDS} }
  gaps {
    target
    targetId
    displayName
    missing
    requiresBirthPlace
    current { ${COORDINATES_FIELDS} }
  }
`;

export const VIEWER_COORDINATES_STATUS = gql`
  query ViewerCoordinatesStatus($cartId: ID) {
    viewerCoordinatesStatus(cartId: $cartId) {
      ${STATUS_FIELDS}
    }
  }
`;

export const VIEWER_UPDATE_COORDINATES = gql`
  mutation ViewerUpdateCoordinates($input: ViewerUpdateCoordinatesInput!) {
    viewerUpdateCoordinates(input: $input) {
      ${STATUS_FIELDS}
    }
  }
`;

// ── Portable ─────────────────────────────────────────────────────────

/** Ordre du sélecteur : Réunion et métropole en tête, puis le reste. */
export const PHONE_COUNTRY_ORDER = ['RE', 'FR', '|', '...'] as const;

/**
 * Valeur E.164 à partir d'un numéro enregistré avant l'obligation, souvent
 * saisi sans indicatif. L'indicatif est deviné sur les préfixes locaux : un
 * `0692…` lu comme français deviendrait +33 692…, numéro d'un autre pays.
 */
export function toE164Guess(raw: string | null | undefined): string | undefined {
  const t = (raw ?? '').replace(/[\s.()-]/g, '');
  if (!t) return undefined;
  if (t.startsWith('+')) return parsePhoneNumberFromString(t)?.number ?? undefined;
  const country: CountryCode = /^0(692|693|262)/.test(t)
    ? 'RE'
    : /^0(639|269)/.test(t)
      ? 'YT'
      : 'FR';
  return parsePhoneNumberFromString(t, country)?.number ?? undefined;
}

export function isValidMobile(value: string | null | undefined): boolean {
  if (!value || !value.startsWith('+')) return false;
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed || !parsed.isValid()) return false;
  const type = parsed.getType();
  return type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE';
}

export function isAddressComplete(a: Partial<AddressValue> | null | undefined): boolean {
  return !!(a?.addressLine?.trim() && a.postalCode?.trim() && a.city?.trim());
}

export function isBirthPlaceComplete(
  b: Partial<BirthPlaceValue> | null | undefined,
): boolean {
  return !!(b?.birthCity?.trim() && b.birthCountryCode?.trim());
}

export function addressOf(c: Partial<Coordinates> | null | undefined): AddressValue {
  return {
    addressLine: c?.addressLine ?? '',
    postalCode: c?.postalCode ?? '',
    city: c?.city ?? '',
  };
}

export function birthPlaceOf(c: Partial<Coordinates> | null | undefined): BirthPlaceValue {
  return {
    birthCity: c?.birthCity ?? '',
    birthCityInseeCode: c?.birthCityInseeCode ?? null,
    birthCountryCode: c?.birthCountryCode ?? 'FR',
  };
}

export const GAP_LABELS: Record<CoordinateGap, string> = {
  PHONE: 'portable',
  ADDRESS: 'adresse',
  BIRTH_PLACE: 'ville de naissance',
};

// ── Pays ─────────────────────────────────────────────────────────────

let countryCache: Array<{ code: string; name: string }> | null = null;

/** Pays triés par nom français, la France en tête. */
export function countryOptions(): Array<{ code: string; name: string }> {
  if (countryCache) return countryCache;
  const names = new Intl.DisplayNames(['fr'], { type: 'region' });
  const all = getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const fr = all.find((c) => c.code === 'FR');
  countryCache = fr ? [fr, ...all.filter((c) => c.code !== 'FR')] : all;
  return countryCache;
}

// ── Référentiels publics (autocomplétion) ────────────────────────────

export type AddressSuggestion = AddressValue & { label: string };
export type CommuneSuggestion = {
  nom: string;
  code: string;
  codeDepartement: string;
};

/** IGN Géoplateforme : successeur d'api-adresse.data.gouv.fr. */
export async function searchAddresses(
  q: string,
  signal: AbortSignal,
): Promise<AddressSuggestion[]> {
  const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&autocomplete=1&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: Array<{
      properties: { label: string; name: string; postcode?: string; city?: string };
    }>;
  };
  return (json.features ?? []).map((f) => ({
    label: f.properties.label,
    addressLine: f.properties.name,
    postalCode: f.properties.postcode ?? '',
    city: f.properties.city ?? '',
  }));
}

/** API Découpage administratif : communes actuelles, DOM compris. */
export async function searchCommunes(
  q: string,
  signal: AbortSignal,
): Promise<CommuneSuggestion[]> {
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,code,codeDepartement&boost=population&limit=8`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  return (await res.json()) as CommuneSuggestion[];
}
