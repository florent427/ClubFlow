import { describe, expect, it } from 'vitest';
import {
  countryOptions,
  isAddressComplete,
  isBirthPlaceComplete,
  isValidMobile,
  toE164Guess,
} from './coordinates';

describe('toE164Guess', () => {
  it('devine l’indicatif d’un ancien numéro saisi sans', () => {
    expect(toE164Guess('0692 12 34 56')).toBe('+262692123456');
    expect(toE164Guess('06.93.00.11.22')).toBe('+262693001122');
    expect(toE164Guess('0639 01 23 45')).toBe('+262639012345');
    expect(toE164Guess('06 12 34 56 78')).toBe('+33612345678');
  });

  it('garde un numéro déjà international et ignore le vide', () => {
    expect(toE164Guess('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(toE164Guess('')).toBeUndefined();
    expect(toE164Guess(null)).toBeUndefined();
  });
});

describe('isValidMobile', () => {
  it('accepte un portable international, refuse un fixe et un numéro local', () => {
    expect(isValidMobile('+262692123456')).toBe(true);
    expect(isValidMobile('+33612345678')).toBe(true);
    expect(isValidMobile('+262262123456')).toBe(false);
    expect(isValidMobile('0692123456')).toBe(false);
    expect(isValidMobile('')).toBe(false);
  });
});

describe('complétude', () => {
  it('exige les trois champs d’adresse et ville + pays de naissance', () => {
    expect(isAddressComplete({ addressLine: '1 rue A', postalCode: '97400', city: 'Saint-Denis' })).toBe(true);
    expect(isAddressComplete({ addressLine: '1 rue A', postalCode: ' ', city: 'Saint-Denis' })).toBe(false);
    expect(isBirthPlaceComplete({ birthCity: 'Saint-Pierre', birthCountryCode: 'FR' })).toBe(true);
    expect(isBirthPlaceComplete({ birthCity: 'Tananarive', birthCountryCode: '' })).toBe(false);
  });
});

describe('countryOptions', () => {
  it('met la France en tête puis trie par nom français', () => {
    const list = countryOptions();
    expect(list[0]).toEqual({ code: 'FR', name: 'France' });
    const rest = list.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(list.find((c) => c.code === 'MG')?.name).toBe('Madagascar');
  });
});
