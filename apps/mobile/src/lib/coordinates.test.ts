import { describe, expect, it } from 'vitest';
import {
  birthPlaceInput,
  countryFlag,
  draftFromGraph,
  guessLegacyPhoneCountry,
  mapAddressResponse,
  mapCommuneResponse,
  mobilePhoneError,
  normalizeStoredMobile,
  orderedCountries,
  resolvePersonCoordinates,
  splitInternationalInput,
  splitStoredPhone,
  toE164,
  type CoordinatesGraph,
} from './coordinates';

const ACCOUNT: CoordinatesGraph = {
  phone: '+262692123456',
  addressLine: '12 rue des Lilas',
  postalCode: '97400',
  city: 'Saint-Denis',
  birthCity: null,
  birthCityInseeCode: null,
  birthCountryCode: null,
};

describe('portable', () => {
  it('devine le pays d’un ancien numéro sans indicatif', () => {
    expect(guessLegacyPhoneCountry('0692 12 34 56')).toBe('RE');
    expect(guessLegacyPhoneCountry('0693123456')).toBe('RE');
    expect(guessLegacyPhoneCountry('0262 20 00 00')).toBe('RE');
    expect(guessLegacyPhoneCountry('0639 12 34 56')).toBe('YT');
    expect(guessLegacyPhoneCountry('0269 61 00 00')).toBe('YT');
    expect(guessLegacyPhoneCountry('06 12 34 56 78')).toBe('FR');
  });

  it('pré-remplit un ancien numéro et le normalise en E.164', () => {
    const legacy = splitStoredPhone('0692123456');
    expect(legacy.country).toBe('RE');
    expect(toE164(legacy.national, legacy.country)).toBe('+262692123456');
    expect(normalizeStoredMobile('0639012345')).toBe('+262639012345');
    expect(splitStoredPhone('+262639012345').country).toBe('YT');
    expect(normalizeStoredMobile('0612345678')).toBe('+33612345678');
  });

  it('valide un portable comme l’API (mobile ou fixe-ou-mobile)', () => {
    expect(mobilePhoneError('+262692123456')).toBeNull();
    expect(mobilePhoneError('+33612345678')).toBeNull();
    expect(mobilePhoneError('+12015550123')).toBeNull(); // US : fixe-ou-mobile
    expect(mobilePhoneError('+262262200000')).toMatch(/pas un portable/);
    expect(mobilePhoneError('0692123456')).toMatch(/invalide/);
    expect(mobilePhoneError('')).toMatch(/obligatoire/);
  });

  it('une saisie qui ne forme pas un numéro n’est jamais un effacement', () => {
    expect(toE164('', 'RE')).toBe('');
    const garbage = toE164('12', 'FR');
    expect(garbage).not.toBe('');
    expect(mobilePhoneError(garbage)).not.toBeNull();
  });

  it('reconnaît un numéro international collé', () => {
    expect(splitInternationalInput('+262 692 12 34 56')).toEqual({
      country: 'RE',
      national: '0692 12 34 56',
    });
    expect(splitInternationalInput('+2')).toBeNull();
  });
});

describe('pays', () => {
  it('drapeau à partir du code ISO', () => {
    expect(countryFlag('fr')).toBe('🇫🇷');
    expect(countryFlag('RE')).toBe('🇷🇪');
    expect(countryFlag('xyz')).toBe('');
  });

  it('La Réunion et la France en tête, puis le reste sans doublon', () => {
    const { priority, others } = orderedCountries({ priority: ['RE', 'FR'] });
    expect(priority.map((c) => c.code)).toEqual(['RE', 'FR']);
    expect(priority[0]).toMatchObject({ name: 'La Réunion', dialCode: '+262' });
    expect(others.some((c) => c.code === 'FR' || c.code === 'RE')).toBe(false);
    expect(others[0].code).toBe('AF');
  });

  it('recherche sans accents, exclusion des DOM pour l’étranger', () => {
    const { others } = orderedCountries({ query: 'algerie' });
    expect(others.map((c) => c.code)).toEqual(['DZ']);
    const abroad = orderedCountries({ exclude: ['FR', 'RE'], query: 'reunion' });
    expect(abroad.others).toHaveLength(0);
  });
});

describe('autocomplétion', () => {
  it('adresse IGN → ligne, code postal, ville', () => {
    const items = mapAddressResponse({
      features: [
        {
          properties: {
            label: '12 Rue des Lilas 97400 Saint-Denis',
            name: '12 Rue des Lilas',
            postcode: '97400',
            city: 'Saint-Denis',
          },
        },
        { properties: {} },
      ],
    });
    expect(items).toEqual([
      {
        label: '12 Rue des Lilas 97400 Saint-Denis',
        addressLine: '12 Rue des Lilas',
        postalCode: '97400',
        city: 'Saint-Denis',
      },
    ]);
    expect(mapAddressResponse(null)).toEqual([]);
  });

  it('commune → « Nom (dép) » et code INSEE', () => {
    expect(
      mapCommuneResponse([
        { nom: 'Saint-Pierre', code: '97416', codeDepartement: '974' },
        { nom: 'Sans code' },
      ]),
    ).toEqual([
      {
        nom: 'Saint-Pierre',
        code: '97416',
        codeDepartement: '974',
        label: 'Saint-Pierre (974)',
      },
    ]);
    expect(mapCommuneResponse({ erreur: true })).toEqual([]);
  });

  it('INSEE effacé hors de France', () => {
    expect(
      birthPlaceInput({
        birthCity: ' Tananarive ',
        birthCityInseeCode: '97416',
        birthCountryCode: 'mg',
      }),
    ).toEqual({
      birthCity: 'Tananarive',
      birthCityInseeCode: null,
      birthCountryCode: 'MG',
    });
  });
});

describe('resolvePersonCoordinates', () => {
  const birth = {
    birthCity: 'Saint-Pierre',
    birthCityInseeCode: '97416',
    birthCountryCode: 'FR',
  };

  it('cases cochées : envoie les valeurs du compte', () => {
    const draft = {
      ...draftFromGraph(null, { phone: true, address: true }),
      birthPlace: birth,
    };
    const res = resolvePersonCoordinates(draft, {
      account: ACCOUNT,
      offerSameAsAccount: true,
      requireBirthPlace: true,
    });
    expect(res).toEqual({
      ok: true,
      input: {
        phone: '+262692123456',
        addressLine: '12 rue des Lilas',
        postalCode: '97400',
        city: 'Saint-Denis',
        ...birth,
      },
    });
  });

  it('cases non proposées (compte incomplet) : la saisie fait foi', () => {
    const draft = draftFromGraph(null, { phone: true, address: true });
    const res = resolvePersonCoordinates(draft, {
      account: ACCOUNT,
      offerSameAsAccount: false,
      requireBirthPlace: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(Object.keys(res.errors).sort()).toEqual([
        'address',
        'birthPlace',
        'phone',
      ]);
    }
  });

  it('portable propre, adresse du compte ; lieu facultatif pour le compte', () => {
    const draft = {
      ...draftFromGraph(null, { phone: false, address: true }),
      phone: '0639012345',
    };
    const res = resolvePersonCoordinates(draft, {
      account: ACCOUNT,
      offerSameAsAccount: true,
      requireBirthPlace: false,
    });
    expect(res).toEqual({
      ok: true,
      input: {
        phone: '+262639012345',
        addressLine: '12 rue des Lilas',
        postalCode: '97400',
        city: 'Saint-Denis',
      },
    });
  });
});
