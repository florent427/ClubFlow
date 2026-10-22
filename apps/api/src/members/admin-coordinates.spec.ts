import { BadRequestException } from '@nestjs/common';
import {
  lenientAdminBirthPlace,
  lenientAdminPhone,
  lenientAdminText,
} from './admin-coordinates';

describe('coordonnées saisies par l’admin (souple)', () => {
  it('portable : E.164 si reconnu, brut nettoyé sinon, vide = effacé, absent = inchangé', () => {
    expect(lenientAdminPhone('+262 692 12 34 56')).toBe('+262692123456');
    expect(lenientAdminPhone(' 0692 12 34 56 ')).toBe('0692 12 34 56');
    expect(lenientAdminPhone('+262262123456')).toBe('+262262123456');
    expect(lenientAdminPhone('  ')).toBeNull();
    expect(lenientAdminPhone(null)).toBeNull();
    expect(lenientAdminPhone(undefined)).toBeUndefined();
  });

  it('texte : nettoyé, vide = effacé, absent = inchangé', () => {
    expect(lenientAdminText(' 1 rue A ')).toBe('1 rue A');
    expect(lenientAdminText('')).toBeNull();
    expect(lenientAdminText(undefined)).toBeUndefined();
  });

  it('lieu de naissance : rien de fourni = rien à écrire', () => {
    expect(lenientAdminBirthPlace({})).toBeUndefined();
  });

  it('lieu de naissance complet : pays en majuscules, INSEE effacé hors de France', () => {
    expect(
      lenientAdminBirthPlace({
        birthCity: 'Saint-Pierre',
        birthCityInseeCode: '97416',
        birthCountryCode: 'fr',
      }),
    ).toEqual({
      birthCity: 'Saint-Pierre',
      birthCityInseeCode: '97416',
      birthCountryCode: 'FR',
    });
    expect(
      lenientAdminBirthPlace(
        { birthCountryCode: 'MG', birthCity: 'Antananarivo' },
        { birthCityInseeCode: '97416' },
      ),
    ).toEqual({
      birthCity: 'Antananarivo',
      birthCityInseeCode: null,
      birthCountryCode: 'MG',
    });
  });

  it('lieu de naissance : vide = effacé, partiel = gardé sans erreur', () => {
    expect(
      lenientAdminBirthPlace(
        { birthCity: '', birthCountryCode: null },
        { birthCity: 'Paris', birthCountryCode: 'FR', birthCityInseeCode: '75056' },
      ),
    ).toEqual({ birthCity: null, birthCityInseeCode: null, birthCountryCode: null });
    expect(lenientAdminBirthPlace({ birthCity: 'Paris' })).toEqual({
      birthCity: 'Paris',
      birthCityInseeCode: null,
      birthCountryCode: null,
    });
  });

  it('lieu de naissance : un pays mal formé reste refusé', () => {
    expect(() =>
      lenientAdminBirthPlace({ birthCity: 'Paris', birthCountryCode: 'F1' }),
    ).toThrow(BadRequestException);
    expect(() => lenientAdminBirthPlace({ birthCountryCode: 'F1' })).toThrow(
      BadRequestException,
    );
  });
});
