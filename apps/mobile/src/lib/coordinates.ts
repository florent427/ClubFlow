import {
  AsYouType,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';
import { COUNTRIES_FR } from './country-names-fr';

/**
 * Coordonnées exigées à l'adhésion en ligne (portable E.164, adresse,
 * lieu de naissance) — logique pure, partagée par les composants de
 * `components/coordinates`. Les règles qui font foi sont côté API
 * (`apps/api/src/common/coordinates/coordinates.ts`) : on reproduit ici
 * la même définition du portable valide pour prévenir avant l'envoi.
 */

export type Country = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
};

/** Pays proposés en tête du sélecteur d'indicatif. */
export const PRIORITY_COUNTRY_CODES = ['RE', 'FR'] as const;

/**
 * Départements d'outre-mer : leurs communes sont dans le référentiel
 * geo.api.gouv.fr, on les saisit donc côté « France », pas « étranger ».
 */
export const FRENCH_DOM_CODES = ['FR', 'RE', 'YT', 'GP', 'MQ', 'GF'] as const;

/** Drapeau emoji à partir d'un code ISO 3166-1 alpha-2 (indicateurs régionaux). */
export function countryFlag(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(
    ...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

const NAME_BY_CODE = new Map(COUNTRIES_FR.map(([c, n]) => [c, n]));

export function countryNameFr(code: string | null | undefined): string {
  if (!code) return '';
  const c = code.toUpperCase();
  return NAME_BY_CODE.get(c) ?? c;
}

function dialCodeOf(code: string): string {
  try {
    return `+${getCountryCallingCode(code as CountryCode)}`;
  } catch {
    return '';
  }
}

let cachedCountries: Country[] | null = null;

/** Tous les pays, triés en français. */
export function allCountries(): Country[] {
  if (!cachedCountries) {
    cachedCountries = COUNTRIES_FR.map(([code, name]) => ({
      code,
      name,
      dialCode: dialCodeOf(code),
      flag: countryFlag(code),
    }));
  }
  return cachedCountries;
}

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null;
  const c = code.toUpperCase();
  return allCountries().find((x) => x.code === c) ?? null;
}

/**
 * Ordre d'affichage du sélecteur : pays prioritaires, puis séparateur,
 * puis tous les autres par ordre alphabétique. `query` filtre sur le nom,
 * le code ISO ou l'indicatif.
 */
export function orderedCountries(opts: {
  priority?: readonly string[];
  exclude?: readonly string[];
  query?: string;
}): { priority: Country[]; others: Country[] } {
  const exclude = new Set((opts.exclude ?? []).map((c) => c.toUpperCase()));
  const q = normalizeSearch(opts.query ?? '');
  const matches = (c: Country) =>
    !q ||
    normalizeSearch(c.name).includes(q) ||
    c.code.toLowerCase() === q ||
    c.dialCode.replace('+', '').startsWith(q.replace('+', ''));
  const priorityCodes = (opts.priority ?? []).filter((c) => !exclude.has(c));
  const priority = priorityCodes
    .map((c) => countryByCode(c))
    .filter((c): c is Country => c !== null && matches(c));
  const prioritySet = new Set(priorityCodes);
  const others = allCountries().filter(
    (c) => !exclude.has(c.code) && !prioritySet.has(c.code) && matches(c),
  );
  return { priority, others };
}

/** Minuscule sans accents — recherche tolérante (« reunion » trouve « La Réunion »). */
export function normalizeSearch(s: string): string {
  let decomposed = s;
  try {
    decomposed = s.normalize('NFD');
  } catch {
    // Moteur sans normalisation Unicode : recherche sensible aux accents.
  }
  return decomposed
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// ── Portable ────────────────────────────────────────────────────────

/**
 * Pays d'un ancien numéro enregistré sans indicatif : la Réunion et
 * Mayotte partagent le +262, on les reconnaît à leur préfixe national.
 */
export function guessLegacyPhoneCountry(raw: string): 'RE' | 'YT' | 'FR' {
  const digits = raw.replace(/\D/g, '');
  if (/^0(692|693|262)/.test(digits)) return 'RE';
  if (/^0(639|269)/.test(digits)) return 'YT';
  return 'FR';
}

/**
 * Décompose une valeur enregistrée (E.164 ou ancien numéro national) en
 * pays + saisie nationale formatée, pour pré-remplir le champ.
 */
export function splitStoredPhone(
  value: string | null | undefined,
  fallbackCountry = 'RE',
): { country: string; national: string } {
  const v = (value ?? '').trim();
  if (!v) return { country: fallbackCountry, national: '' };
  if (v.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(v);
    if (parsed?.country) {
      return { country: parsed.country, national: parsed.formatNational() };
    }
    return { country: fallbackCountry, national: v };
  }
  const country = guessLegacyPhoneCountry(v);
  return { country, national: formatNationalInput(v, country) };
}

/**
 * Saisie commençant par « + » : pays et saisie nationale formatée dès que
 * le numéro est reconnu, null tant qu'il est trop court pour l'être.
 */
export function splitInternationalInput(
  text: string,
): { country: string; national: string } | null {
  const parsed = parsePhoneNumberFromString(text.trim());
  if (!parsed?.country) return null;
  return { country: parsed.country, national: parsed.formatNational() };
}

/** Formatage au fil de la frappe (chiffres seulement). */
export function formatNationalInput(text: string, country: string): string {
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  return new AsYouType(country as CountryCode).input(digits);
}

/**
 * Saisie nationale + pays → E.164. '' seulement si le champ est vide : une
 * saisie qui ne forme pas un numéro donne une valeur non vide mais
 * invalide (refusée par `mobilePhoneError`), jamais un effacement.
 */
export function toE164(national: string, country: string): string {
  const digits = national.replace(/\D/g, '');
  if (!digits) return '';
  const parsed = parsePhoneNumberFromString(digits, country as CountryCode);
  if (parsed) return parsed.number;
  return `${dialCodeOf(country) || '+'}${digits.replace(/^0+/, '')}`;
}

/**
 * Message d'erreur si la valeur n'est pas un portable E.164 valide, null
 * sinon. Même définition que l'API : mobile, ou fixe-ou-mobile pour les
 * plans qui ne distinguent pas (États-Unis, Canada…).
 */
export function mobilePhoneError(e164: string | null | undefined): string | null {
  const v = (e164 ?? '').trim();
  if (!v) return 'Le numéro de portable est obligatoire.';
  if (!v.startsWith('+')) return 'Numéro de portable invalide.';
  const parsed = parsePhoneNumberFromString(v);
  if (!parsed || !parsed.isValid()) return 'Numéro de portable invalide.';
  const type = parsed.getType();
  if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
    return 'Ce numéro n’est pas un portable.';
  }
  return null;
}

/** Version normalisée d'un numéro enregistré, ou '' s'il n'est pas un portable valide. */
export function normalizeStoredMobile(value: string | null | undefined): string {
  const { country, national } = splitStoredPhone(value);
  const e164 = toE164(national, country);
  return mobilePhoneError(e164) ? '' : e164;
}

// ── Adresse ─────────────────────────────────────────────────────────

export type AddressValue = {
  addressLine: string;
  postalCode: string;
  city: string;
};

export const EMPTY_ADDRESS: AddressValue = {
  addressLine: '',
  postalCode: '',
  city: '',
};

export function addressError(a: AddressValue): string | null {
  if (!a.addressLine.trim() || !a.postalCode.trim() || !a.city.trim()) {
    return 'Adresse, code postal et ville sont obligatoires.';
  }
  return null;
}

export type AddressSuggestion = AddressValue & { label: string };

/** IGN Géoplateforme (successeur d'api-adresse.data.gouv.fr). */
export function addressSearchUrl(q: string): string {
  return `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(
    q.trim(),
  )}&autocomplete=1&limit=5`;
}

type GeoplateformeResponse = {
  features?: Array<{
    properties?: {
      label?: string;
      name?: string;
      postcode?: string;
      city?: string;
    };
  }>;
};

export function mapAddressResponse(json: unknown): AddressSuggestion[] {
  const features = (json as GeoplateformeResponse | null)?.features ?? [];
  const out: AddressSuggestion[] = [];
  for (const f of features) {
    const p = f.properties;
    if (!p?.name) continue;
    out.push({
      label: p.label ?? [p.name, p.postcode, p.city].filter(Boolean).join(' '),
      addressLine: p.name,
      postalCode: p.postcode ?? '',
      city: p.city ?? '',
    });
  }
  return out;
}

// ── Lieu de naissance ───────────────────────────────────────────────

export type BirthPlaceValue = {
  birthCity: string;
  /** Code INSEE de la commune choisie dans l'autocomplétion, null en saisie libre. */
  birthCityInseeCode: string | null;
  /** ISO 3166-1 alpha-2 ; '' tant que le pays n'est pas choisi. */
  birthCountryCode: string;
};

export const EMPTY_BIRTH_PLACE: BirthPlaceValue = {
  birthCity: '',
  birthCityInseeCode: null,
  birthCountryCode: 'FR',
};

export function birthPlaceError(b: BirthPlaceValue): string | null {
  if (!b.birthCountryCode.trim()) return 'Choisissez le pays de naissance.';
  if (!b.birthCity.trim()) return 'La ville de naissance est obligatoire.';
  return null;
}

/** Valeur prête à envoyer : INSEE effacé hors France, chaînes nettoyées. */
export function birthPlaceInput(b: BirthPlaceValue): BirthPlaceValue {
  const country = b.birthCountryCode.trim().toUpperCase();
  return {
    birthCity: b.birthCity.trim(),
    birthCityInseeCode:
      country === 'FR' ? b.birthCityInseeCode?.trim() || null : null,
    birthCountryCode: country,
  };
}

export type CommuneSuggestion = {
  nom: string;
  code: string;
  codeDepartement: string;
  label: string;
};

export function communeSearchUrl(q: string): string {
  return `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(
    q.trim(),
  )}&fields=nom,code,codesPostaux,codeDepartement&boost=population&limit=8`;
}

type GeoCommune = {
  nom?: string;
  code?: string;
  codeDepartement?: string;
};

export function mapCommuneResponse(json: unknown): CommuneSuggestion[] {
  if (!Array.isArray(json)) return [];
  const out: CommuneSuggestion[] = [];
  for (const c of json as GeoCommune[]) {
    if (!c?.nom || !c.code) continue;
    const dep = c.codeDepartement ?? '';
    out.push({
      nom: c.nom,
      code: c.code,
      codeDepartement: dep,
      label: dep ? `${c.nom} (${dep})` : c.nom,
    });
  }
  return out;
}

// ── Contrat GraphQL ─────────────────────────────────────────────────

export type CoordinatesTarget = 'ACCOUNT' | 'PENDING_ITEM' | 'MEMBER';
export type CoordinateGapKind = 'PHONE' | 'ADDRESS' | 'BIRTH_PLACE';

export type CoordinatesGraph = {
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  birthCity: string | null;
  birthCityInseeCode: string | null;
  birthCountryCode: string | null;
};

export type CoordinatesGap = {
  target: CoordinatesTarget;
  targetId: string | null;
  displayName: string;
  missing: string[];
  requiresBirthPlace: boolean;
  current: CoordinatesGraph;
};

export type CoordinatesStatus = {
  account: CoordinatesGraph;
  accountComplete: boolean;
  gaps: CoordinatesGap[];
};

export function gapLabelFr(kind: string): string {
  switch (kind) {
    case 'PHONE':
      return 'portable';
    case 'ADDRESS':
      return 'adresse';
    case 'BIRTH_PLACE':
      return 'ville de naissance';
    default:
      return kind.toLowerCase();
  }
}

export function addressFromGraph(g: CoordinatesGraph | null | undefined): AddressValue {
  return {
    addressLine: g?.addressLine ?? '',
    postalCode: g?.postalCode ?? '',
    city: g?.city ?? '',
  };
}

export function birthPlaceFromGraph(
  g: CoordinatesGraph | null | undefined,
): BirthPlaceValue {
  return {
    birthCity: g?.birthCity ?? '',
    birthCityInseeCode: g?.birthCityInseeCode ?? null,
    birthCountryCode: g?.birthCountryCode ?? 'FR',
  };
}

// ── Brouillon d'une fiche (formulaires enfant, panier, compte) ──────

export type PersonCoordinatesDraft = {
  /** E.164 émis par PhoneField (ou ancienne valeur à normaliser). */
  phone: string;
  address: AddressValue;
  birthPlace: BirthPlaceValue;
  /** « Même portable que le compte » (pris en compte s'il est proposé). */
  samePhone: boolean;
  /** « Même adresse que le compte » (pris en compte s'il est proposé). */
  sameAddress: boolean;
};

export function draftFromGraph(
  current: CoordinatesGraph | null | undefined,
  same: { phone: boolean; address: boolean } = { phone: false, address: false },
): PersonCoordinatesDraft {
  return {
    phone: current?.phone ?? '',
    address: addressFromGraph(current),
    birthPlace: birthPlaceFromGraph(current),
    samePhone: same.phone,
    sameAddress: same.address,
  };
}

export type CoordinatesInput = {
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  birthCity?: string;
  birthCityInseeCode?: string | null;
  birthCountryCode?: string;
};

export type CoordinatesErrors = {
  phone?: string;
  address?: string;
  birthPlace?: string;
};

/**
 * Valeurs à envoyer pour une fiche : celles du compte quand la case
 * « même … que le compte » est cochée (copie, pas de lien persistant),
 * sinon celles saisies. Renvoie les erreurs par bloc si la fiche est
 * incomplète.
 */
export function resolvePersonCoordinates(
  draft: PersonCoordinatesDraft,
  opts: {
    /** Compte complet : les cases « même … » sont proposées. */
    account: CoordinatesGraph | null;
    offerSameAsAccount: boolean;
    requireBirthPlace: boolean;
  },
):
  | { ok: true; input: CoordinatesInput }
  | { ok: false; errors: CoordinatesErrors } {
  const useAccountPhone = opts.offerSameAsAccount && draft.samePhone;
  const useAccountAddress = opts.offerSameAsAccount && draft.sameAddress;
  const phone = useAccountPhone
    ? (opts.account?.phone ?? '').trim()
    : normalizeStoredMobile(draft.phone) || draft.phone.trim();
  const address = useAccountAddress
    ? addressFromGraph(opts.account)
    : draft.address;

  const errors: CoordinatesErrors = {};
  const phoneErr = mobilePhoneError(phone);
  if (phoneErr) errors.phone = phoneErr;
  const addrErr = addressError(address);
  if (addrErr) errors.address = addrErr;
  let birth: BirthPlaceValue | null = null;
  if (opts.requireBirthPlace) {
    const birthErr = birthPlaceError(draft.birthPlace);
    if (birthErr) errors.birthPlace = birthErr;
    else birth = birthPlaceInput(draft.birthPlace);
  }
  if (errors.phone || errors.address || errors.birthPlace) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      phone,
      addressLine: address.addressLine.trim(),
      postalCode: address.postalCode.trim(),
      city: address.city.trim(),
      ...(birth ?? {}),
    },
  };
}

/** « 12 rue des Lilas, 97400 Saint-Denis » — résumé d'une adresse. */
export function addressSummary(g: CoordinatesGraph | null | undefined): string {
  const a = addressFromGraph(g);
  const town = [a.postalCode, a.city].filter((s) => s.trim()).join(' ');
  return [a.addressLine, town].filter((s) => s.trim()).join(', ');
}

/** Portable affiché à l'international (« +262 692 12 34 56 »). */
export function phoneDisplay(e164: string | null | undefined): string {
  const v = (e164 ?? '').trim();
  if (!v) return '';
  const parsed = parsePhoneNumberFromString(v);
  return parsed ? parsed.formatInternational() : v;
}
