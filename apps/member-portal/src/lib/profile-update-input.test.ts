import { describe, expect, it } from 'vitest';
import type { EditableProfileFieldKey } from './viewer-types';
import {
  entreePhoto,
  entreeProfilSaisi,
  type SaisieProfil,
} from './profile-update-input';

/**
 * Bug de production du 2026-09-21 : l'adhérent modifiait son adresse et sa
 * date de naissance, l'enregistrement répondait BadRequestException. En
 * cause, `photoUrl` — que le formulaire n'édite pas mais renvoyait quand
 * même. 39 adhérents de SKSR portent une photo en data URL héritée, de
 * 29 000 à 71 000 caractères, là où le DTO plafonne à 512.
 */

const TOUS: ReadonlySet<EditableProfileFieldKey> = new Set([
  'PHONE',
  'ADDRESS_LINE',
  'POSTAL_CODE',
  'CITY',
  'BIRTH_DATE',
]);

function saisie(over: Partial<SaisieProfil> = {}): SaisieProfil {
  return {
    firstName: 'Léa',
    lastName: 'Dupont',
    email: 'lea@exemple.fr',
    phone: '0692000000',
    addressLine: '77 T chemin du Maniron',
    postalCode: '97427',
    city: 'L’Étang-Salé',
    birthDate: '2010-05-12',
    ...over,
  };
}

describe('entreeProfilSaisi', () => {
  it('n’envoie jamais la photo : le formulaire ne l’édite pas', () => {
    expect(entreeProfilSaisi(saisie(), TOUS)).not.toHaveProperty('photoUrl');
  });

  it('porte les champs saisis quand le club les expose', () => {
    expect(entreeProfilSaisi(saisie(), TOUS)).toEqual({
      firstName: 'Léa',
      lastName: 'Dupont',
      email: 'lea@exemple.fr',
      phone: '0692000000',
      addressLine: '77 T chemin du Maniron',
      postalCode: '97427',
      city: 'L’Étang-Salé',
      birthDate: '2010-05-12',
    });
  });

  it('omet les champs que le club n’expose pas, plutôt que de les vider', () => {
    const entree = entreeProfilSaisi(saisie(), new Set(['PHONE']));

    expect(entree.phone).toBe('0692000000');
    expect(entree).not.toHaveProperty('addressLine');
    expect(entree).not.toHaveProperty('postalCode');
    expect(entree).not.toHaveProperty('city');
    expect(entree).not.toHaveProperty('birthDate');
  });

  it('omet une date vide : la chaîne vide n’est pas une date ISO', () => {
    const entree = entreeProfilSaisi(saisie({ birthDate: '' }), TOUS);
    expect(entree).not.toHaveProperty('birthDate');
  });

  it('laisse passer une adresse vidée : c’est un effacement volontaire', () => {
    const entree = entreeProfilSaisi(saisie({ addressLine: '  ' }), TOUS);
    expect(entree.addressLine).toBe('');
  });

  it('rogne les espaces et rend null un e-mail vide', () => {
    const entree = entreeProfilSaisi(
      saisie({ firstName: '  Léa  ', email: '   ' }),
      TOUS,
    );
    expect(entree.firstName).toBe('Léa');
    expect(entree.email).toBeNull();
  });

  it('reste sous la limite du DTO même avec une photo monstrueuse en mémoire', () => {
    // Le state du portail contient la data URL relue depuis l'API ; elle ne
    // doit pas atteindre la requête.
    const entree = entreeProfilSaisi(saisie(), TOUS);
    for (const valeur of Object.values(entree)) {
      expect(typeof valeur === 'string' ? valeur.length : 0).toBeLessThanOrEqual(512);
    }
  });
});

describe('entreePhoto', () => {
  it('ne porte que la photo', () => {
    expect(entreePhoto('https://api.test/media/abc')).toEqual({
      photoUrl: 'https://api.test/media/abc',
    });
  });

  it('transporte l’effacement', () => {
    expect(entreePhoto('')).toEqual({ photoUrl: '' });
  });
});
