import { describe, expect, it } from 'vitest';
import { contactCoordinateGaps, memberCoordinateGaps } from './completeness';
import { guessLegacyPhoneCountry, phoneForSave, phoneToE164Guess } from './phone';

describe('ancien numéro sans indicatif', () => {
  it('devine La Réunion, Mayotte, sinon la France', () => {
    expect(guessLegacyPhoneCountry('0692 12 34 56')).toBe('RE');
    expect(guessLegacyPhoneCountry('0693001122')).toBe('RE');
    expect(guessLegacyPhoneCountry('02 62 12 34 56')).toBe('RE');
    expect(guessLegacyPhoneCountry('0639 01 02 03')).toBe('YT');
    expect(guessLegacyPhoneCountry('0269 61 00 00')).toBe('YT');
    expect(guessLegacyPhoneCountry('06 12 34 56 78')).toBe('FR');
  });

  it('convertit en E.164 avec le pays deviné', () => {
    expect(phoneToE164Guess('0692 12 34 56')).toBe('+262692123456');
    expect(phoneToE164Guess('06 12 34 56 78')).toBe('+33612345678');
    expect(phoneToE164Guess('+262 692 12 34 56')).toBe('+262692123456');
    expect(phoneToE164Guess('')).toBeNull();
    expect(phoneToE164Guess('n/c')).toBeNull();
  });

  it('enregistre ce qui est affiché, ou le texte brut si inexploitable', () => {
    expect(phoneForSave(' 0692123456 ')).toBe('+262692123456');
    expect(phoneForSave('n/c')).toBe('n/c');
    expect(phoneForSave('  ')).toBeNull();
  });
});

describe('fiche incomplète', () => {
  const complete = {
    phone: '+262692123456',
    addressLine: '1 rue A',
    postalCode: '97400',
    city: 'Saint-Denis',
    birthCity: 'Saint-Pierre',
    birthCountryCode: 'FR',
  };

  it('rien à signaler sur une fiche complète', () => {
    expect(memberCoordinateGaps(complete)).toEqual([]);
  });

  it('signale un ancien numéro, une adresse partielle, un lieu de naissance absent', () => {
    expect(
      memberCoordinateGaps({
        ...complete,
        phone: '0692123456',
        city: ' ',
        birthCountryCode: null,
      }),
    ).toEqual(['portable', 'adresse', 'ville de naissance']);
  });

  it('un contact ne réclame pas de lieu de naissance', () => {
    expect(contactCoordinateGaps({ ...complete, phone: null })).toEqual(['portable']);
  });
});
