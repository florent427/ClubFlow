import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ViewerUpdateMyProfileInput } from './viewer-update-my-profile.input';

/**
 * Bug de production du 2026-09-21 : un adhérent modifiait son adresse et sa
 * date de naissance, l'enregistrement répondait BadRequestException.
 *
 * La cause est ici : `photoUrl` est plafonné à 512 caractères, or 39 fiches
 * de SKSR portent une photo en *data URL* héritée (29 000 à 71 000
 * caractères). Le portail relisait cette valeur et la renvoyait au submit,
 * alors même qu'il n'édite pas la photo — la validation refusait tout.
 *
 * La limite reste : 512 est la bonne borne pour une URL, et l'assouplir
 * reviendrait à accepter des images en base64 dans une colonne d'adresse.
 * Ce que le correctif change est côté portail (cf. `profile-update-input`) ;
 * ce test dit pourquoi la borne est là et ce qu'elle refuse.
 */

function valider(brut: Record<string, unknown>) {
  return validateSync(
    plainToInstance(ViewerUpdateMyProfileInput, brut, {
      enableImplicitConversion: false,
    }),
    { whitelist: true },
  );
}

const DATA_URL = `data:image/jpeg;base64,${'A'.repeat(70000)}`;

describe('ViewerUpdateMyProfileInput', () => {
  it('refuse une photo en data URL : c’est ce qui cassait l’enregistrement', () => {
    const erreurs = valider({ photoUrl: DATA_URL });

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].property).toBe('photoUrl');
    expect(Object.keys(erreurs[0].constraints ?? {})).toContain('isLength');
  });

  it('accepte le patch que le portail envoie désormais, sans photo', () => {
    expect(
      valider({
        firstName: 'Léa',
        lastName: 'Dupont',
        email: 'lea@exemple.fr',
        phone: '0692000000',
        addressLine: '77 T chemin du Maniron',
        postalCode: '97427',
        city: 'L’Étang-Salé',
        birthDate: '2010-05-12',
      }),
    ).toEqual([]);
  });

  it('accepte une URL de média normale', () => {
    expect(
      valider({ photoUrl: 'https://api.clubflow.topdigital.re/media/abc-123' }),
    ).toEqual([]);
  });

  it('refuse une date vide, accepte une date absente', () => {
    expect(valider({ birthDate: '' })).toHaveLength(1);
    expect(valider({})).toEqual([]);
  });

  it('tolère null sur les champs optionnels : null efface, undefined ignore', () => {
    expect(valider({ email: null, phone: null, addressLine: null })).toEqual([]);
  });
});
