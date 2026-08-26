import { BadRequestException } from '@nestjs/common';
import { ViewerService } from './viewer.service';

/**
 * L'adhérent complète ses coordonnées depuis le portail — mais SOUS LE
 * CONTRÔLE DU CATALOGUE DE SON CLUB.
 *
 * Le formulaire du portail ne présente que les champs exposés. Ça ne suffit
 * pas : l'écran peut être périmé et la mutation GraphQL est appelable
 * directement. Le refus doit être prononcé PAR LE SERVICE, et c'est
 * exactement ce que ces tests constatent — un écran correct passerait tout
 * aussi bien avec un service qui n'arbitre rien.
 *
 * Instanciation par le prototype : `updateMyProfile` ne touche que trois des
 * quinze dépendances de `ViewerService`. Passer par le constructeur
 * coupleraient ces tests à l'ordre des paramètres.
 */
const CLUB = 'club-1';
const MEMBRE = 'membre-1';
const USER = 'user-1';

type Reglage = { showOnForm: boolean; required: boolean };

function makeService(catalogue: Record<string, Reglage>) {
  const updates: Record<string, unknown>[] = [];

  const prisma = {
    member: {
      findFirst: jest.fn(async () => ({ id: MEMBRE })),
      findUniqueOrThrow: jest.fn(async () => ({ email: 'moi@example.com' })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: MEMBRE };
      }),
    },
  };
  const fieldConfig = {
    getCatalogSettingsMap: jest.fn(
      async () => new Map(Object.entries(catalogue)),
    ),
  };

  const svc = Object.create(ViewerService.prototype) as ViewerService;
  Object.assign(svc, {
    prisma,
    fieldConfig,
    memberActivation: { maybeActivateMemberAccount: jest.fn() },
  });
  // `updateMyProfile` se termine par une relecture complète du profil, qui
  // n'a rien à voir avec ce qui est testé ici.
  (svc as unknown as { viewerMe: unknown }).viewerMe = jest.fn(async () => ({
    id: MEMBRE,
  }));

  return { svc, updates, prisma };
}

const TOUT_AFFICHE: Record<string, Reglage> = {
  PHONE: { showOnForm: true, required: false },
  ADDRESS_LINE: { showOnForm: true, required: false },
  POSTAL_CODE: { showOnForm: true, required: false },
  CITY: { showOnForm: true, required: false },
  BIRTH_DATE: { showOnForm: true, required: false },
};

describe('updateMyProfile — ce que l’adhérent peut enregistrer', () => {
  it('enregistre adresse, code postal, ville et date de naissance', async () => {
    const { svc, updates } = makeService(TOUT_AFFICHE);

    await svc.updateMyProfile(CLUB, MEMBRE, USER, {
      addressLine: '12 rue des Lataniers',
      postalCode: '97427',
      city: 'L’Étang-Salé',
      birthDate: '1985-03-12',
    });

    expect(updates[0]).toMatchObject({
      addressLine: '12 rue des Lataniers',
      postalCode: '97427',
      city: 'L’Étang-Salé',
    });
    expect(updates[0].birthDate).toEqual(new Date('1985-03-12'));
  });

  it('un champ omis n’est PAS écrasé', async () => {
    // La distinction undefined (ne pas toucher) / '' (effacer) est ce qui
    // permet au portail de n'envoyer qu'une partie du formulaire.
    const { svc, updates } = makeService(TOUT_AFFICHE);

    await svc.updateMyProfile(CLUB, MEMBRE, USER, { city: 'Saint-Pierre' });

    expect(updates[0]).toHaveProperty('city', 'Saint-Pierre');
    expect(updates[0]).not.toHaveProperty('addressLine');
    expect(updates[0]).not.toHaveProperty('postalCode');
  });

  it('vider un champ facultatif l’efface (null, pas chaîne vide)', async () => {
    const { svc, updates } = makeService(TOUT_AFFICHE);

    await svc.updateMyProfile(CLUB, MEMBRE, USER, { addressLine: '   ' });

    expect(updates[0].addressLine).toBeNull();
  });
});

describe('updateMyProfile — ce que le catalogue du club interdit', () => {
  it('REFUSE d’écrire un champ que le club a masqué', async () => {
    // Le cas qui motive le garde-fou : le club a retiré la date de
    // naissance de sa fiche adhérent. Un portail périmé, ou un appel
    // direct, ne doit pas pouvoir la réintroduire.
    const { svc, prisma } = makeService({
      ...TOUT_AFFICHE,
      BIRTH_DATE: { showOnForm: false, required: false },
    });

    await expect(
      svc.updateMyProfile(CLUB, MEMBRE, USER, { birthDate: '1985-03-12' }),
    ).rejects.toThrow(BadRequestException);

    // L'assertion qui mord : rien n'a été écrit du tout.
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('REFUSE de vider un champ que le club rend obligatoire', async () => {
    const { svc, prisma } = makeService({
      ...TOUT_AFFICHE,
      CITY: { showOnForm: true, required: true },
    });

    await expect(
      svc.updateMyProfile(CLUB, MEMBRE, USER, { city: '' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('ACCEPTE de renseigner un champ obligatoire', async () => {
    // Le pendant indispensable : tout refuser passerait les deux tests
    // précédents et rendrait la fonctionnalité inutilisable.
    const { svc, updates } = makeService({
      ...TOUT_AFFICHE,
      CITY: { showOnForm: true, required: true },
    });

    await svc.updateMyProfile(CLUB, MEMBRE, USER, { city: 'Saint-Louis' });

    expect(updates[0].city).toBe('Saint-Louis');
  });

  it('le téléphone passe par le même contrôle que l’adresse', async () => {
    // Il était écrit sans arbitrage avant ce changement : un club qui
    // masque le téléphone doit être obéi lui aussi.
    const { svc, prisma } = makeService({
      ...TOUT_AFFICHE,
      PHONE: { showOnForm: false, required: false },
    });

    await expect(
      svc.updateMyProfile(CLUB, MEMBRE, USER, { phone: '0692000000' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('un club sans réglage explicite laisse le champ ouvert', async () => {
    // Défaut sûr : le catalogue est semé à la volée, une entrée absente ne
    // doit pas bloquer la saisie.
    const { svc, updates } = makeService({});

    await svc.updateMyProfile(CLUB, MEMBRE, USER, { city: 'Le Tampon' });

    expect(updates[0].city).toBe('Le Tampon');
  });
});
