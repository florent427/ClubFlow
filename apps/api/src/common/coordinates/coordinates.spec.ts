import {
  coordinateGaps,
  normalizeMobilePhone,
  requireAddress,
  requireBirthPlace,
  requireMobilePhone,
} from './coordinates';

describe('normalizeMobilePhone', () => {
  it('accepte les portables réunionnais, mahorais et métropolitains en E.164', () => {
    expect(normalizeMobilePhone('+262 692 12 34 56')).toBe('+262692123456');
    expect(normalizeMobilePhone('+262693001122')).toBe('+262693001122');
    expect(normalizeMobilePhone('+33 6 12 34 56 78')).toBe('+33612345678');
  });

  it('refuse un fixe, un numéro invalide et un numéro sans indicatif', () => {
    expect(normalizeMobilePhone('+262262123456')).toBeNull(); // fixe Réunion
    expect(normalizeMobilePhone('+33145678901')).toBeNull(); // fixe Paris
    expect(normalizeMobilePhone('+3361234')).toBeNull();
    // Sans indicatif, 0692… serait lu comme français : on refuse.
    expect(normalizeMobilePhone('0692123456')).toBeNull();
    expect(normalizeMobilePhone('')).toBeNull();
    expect(normalizeMobilePhone(null)).toBeNull();
  });

  it('requireMobilePhone lève un message qui nomme la personne', () => {
    expect(() => requireMobilePhone('0692123456', 'Léa Payet')).toThrow(
      /Léa Payet/,
    );
  });
});

describe('requireAddress', () => {
  it('exige rue, code postal et ville', () => {
    expect(
      requireAddress({ addressLine: ' 1 rue A ', postalCode: '97400', city: 'Saint-Denis' }),
    ).toEqual({ addressLine: '1 rue A', postalCode: '97400', city: 'Saint-Denis' });
    expect(() =>
      requireAddress({ addressLine: '1 rue A', postalCode: ' ', city: 'Saint-Denis' }),
    ).toThrow(/Adresse complète/);
  });
});

describe('requireBirthPlace', () => {
  it('garde le code INSEE pour une commune française', () => {
    expect(
      requireBirthPlace({ birthCity: 'Saint-Pierre', birthCityInseeCode: '97416', birthCountryCode: 'fr' }),
    ).toEqual({ birthCity: 'Saint-Pierre', birthCityInseeCode: '97416', birthCountryCode: 'FR' });
    expect(
      requireBirthPlace({ birthCity: 'Ajaccio', birthCityInseeCode: '2A004', birthCountryCode: 'FR' }).birthCityInseeCode,
    ).toBe('2A004');
  });

  it('écarte le code INSEE hors de France', () => {
    expect(
      requireBirthPlace({ birthCity: 'Antananarivo', birthCityInseeCode: '97416', birthCountryCode: 'MG' }),
    ).toEqual({ birthCity: 'Antananarivo', birthCityInseeCode: null, birthCountryCode: 'MG' });
  });

  it('refuse une ville ou un pays absent, un pays ou un code mal formé', () => {
    expect(() => requireBirthPlace({ birthCity: '', birthCountryCode: 'FR' })).toThrow();
    expect(() => requireBirthPlace({ birthCity: 'Paris', birthCountryCode: null })).toThrow();
    expect(() => requireBirthPlace({ birthCity: 'Paris', birthCountryCode: 'F1' })).toThrow();
    expect(() =>
      requireBirthPlace({ birthCity: 'Paris', birthCityInseeCode: '751', birthCountryCode: 'FR' }),
    ).toThrow(/Code de commune/);
  });
});

describe('coordinateGaps', () => {
  const complete = {
    phone: '+262692123456',
    addressLine: '1 rue A',
    postalCode: '97400',
    city: 'Saint-Denis',
    birthCity: 'Saint-Denis',
    birthCountryCode: 'FR',
  };

  it('ne signale rien sur une fiche complète', () => {
    expect(coordinateGaps(complete, { requireBirthPlace: true })).toEqual([]);
  });

  it('signale un ancien numéro en texte libre comme portable manquant', () => {
    expect(
      coordinateGaps({ ...complete, phone: '0692 12 34 56' }, { requireBirthPlace: true }),
    ).toEqual(['PHONE']);
  });

  it('ne réclame le lieu de naissance que si demandé', () => {
    const sansNaissance = { ...complete, birthCity: null, birthCountryCode: null };
    expect(coordinateGaps(sansNaissance, { requireBirthPlace: false })).toEqual([]);
    expect(coordinateGaps(sansNaissance, { requireBirthPlace: true })).toEqual([
      'BIRTH_PLACE',
    ]);
    expect(
      coordinateGaps({ ...complete, city: '' }, { requireBirthPlace: true }),
    ).toEqual(['ADDRESS']);
  });
});
