import { NotFoundException } from '@nestjs/common';
import { MediaAssetsService } from './media-assets.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Qui a le droit de lire un fichier.
 *
 * Jusqu'au 2026-07-20, personne ne le vérifiait : `getPublic` faisait un
 * `findUnique({ where: { id } })` sans `clubId`, et la route n'avait aucun
 * guard. Tout justificatif comptable, tout document de subvention, toute
 * pièce jointe de messagerie de tout club était lisible SANS JWT par qui
 * connaissait l'UUID.
 *
 * Le double simule les DEUX faits qui décident : les relations publiques qui
 * pointent vers l'asset, et le club propriétaire. Il n'inspecte aucune forme
 * de requête — c'est le service qui doit refuser, et le test le constate.
 */

type Asset = {
  id: string;
  clubId: string;
  storagePath: string;
  /** Nombre de rattachements à des surfaces PUBLIQUES. */
  publicRefs: number;
  /** Colonne `visibility` — couvre les surfaces rattachées par URL en texte. */
  visibility?: 'PUBLIC' | 'PRIVATE';
  /** Rattachements à des pièces PRIVÉES (facture, subvention, pièce jointe). */
  privateRefs?: number;
};

const PHOTO_VITRINE: Asset = {
  id: 'a-public',
  clubId: 'club-1',
  storagePath: 'p/public.jpg',
  publicRefs: 1,
};
const JUSTIFICATIF: Asset = {
  id: 'a-prive',
  clubId: 'club-1',
  storagePath: 'p/facture.pdf',
  publicRefs: 0,
};

function makeSvc(assets: Asset[]) {
  const byId = new Map(assets.map((a) => [a.id, a]));

  const prisma = {
    mediaAsset: {
      // `markPublic` écrit avec un `where` scopé au club : le double
      // applique ce filtre pour de vrai, sinon le test ne dirait rien du
      // cloisonnement multi-tenant.
      updateMany: jest.fn(
        async ({ where, data }: { where: any; data: any }) => {
          const a = byId.get(where.id);
          if (!a || a.clubId !== where.clubId) return { count: 0 };
          a.visibility = data.visibility;
          return { count: 1 };
        },
      ),
      findUnique: jest.fn(
        async ({ where, select }: { where: any; select?: any }) => {
          const a = byId.get(where.id);
          if (!a) return null;
          // L'appel de `isPubliclyReadable` demande les compteurs.
          if (select?._count) {
            return {
              visibility: a.visibility ?? 'PRIVATE',
              _count: {
                galleryPhotos: a.publicRefs,
                articleCovers: 0,
                articleOgImages: 0,
                ogPages: 0,
                projectPosters: 0,
                projectCovers: 0,
                projectLiveItems: 0,
                accountingDocuments: a.privateRefs ?? 0,
                accountingExtractions: 0,
                grantDocuments: 0,
                sponsorshipDocuments: 0,
                clubDocumentSources: 0,
                clubSignedDocuments: 0,
                chatAttachments: 0,
                chatThumbnails: 0,
              },
            };
          }
          return { ...a };
        },
      ),
    },
  };

  const storage = {
    getObjectStream: jest.fn(async () => ({ pipe: jest.fn() })),
  };

  const svc = new MediaAssetsService(
    prisma as unknown as PrismaService,
    storage as never,
  );
  return { svc, storage };
}

describe('streamFor — asset PUBLIC', () => {
  it('se sert sans aucun jeton : la vitrine ne doit pas casser', async () => {
    const { svc } = makeSvc([PHOTO_VITRINE]);

    const r = await svc.streamFor('a-public', { clubId: null });

    expect(r.isPublic).toBe(true);
    expect(r.row.id).toBe('a-public');
  });
});

describe('streamFor — asset PRIVÉ', () => {
  it('REFUSE une requête anonyme', async () => {
    // Le cœur du correctif : un justificatif comptable n'est pas lisible
    // parce qu'on connaît son UUID.
    const { svc, storage } = makeSvc([JUSTIFICATIF]);

    await expect(svc.streamFor('a-prive', { clubId: null })).rejects.toThrow(
      NotFoundException,
    );
    // L'assertion qui mord vraiment : le fichier n'a même pas été ouvert.
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('REFUSE un club qui n’est pas propriétaire', async () => {
    const { svc, storage } = makeSvc([JUSTIFICATIF]);

    await expect(
      svc.streamFor('a-prive', { clubId: 'club-2' }),
    ).rejects.toThrow(NotFoundException);
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('ACCEPTE le club propriétaire', async () => {
    // Le pendant indispensable : tout refuser passerait les deux tests
    // précédents et casserait la comptabilité.
    const { svc } = makeSvc([JUSTIFICATIF]);

    const r = await svc.streamFor('a-prive', { clubId: 'club-1' });

    expect(r.isPublic).toBe(false);
    expect(r.row.id).toBe('a-prive');
  });

  it('répond 404 et non 403 : le refus ne confirme pas l’existence', async () => {
    // Un 403 sur un asset existant et un 404 sur un inexistant feraient de
    // l'énumération d'UUID un oracle. Les deux cas doivent être
    // indistinguables.
    const { svc } = makeSvc([JUSTIFICATIF]);

    const refuse = await svc
      .streamFor('a-prive', { clubId: 'club-2' })
      .catch((e: Error) => e.constructor.name);
    const inexistant = await svc
      .streamFor('a-inconnu', { clubId: 'club-2' })
      .catch((e: Error) => e.constructor.name);

    expect(refuse).toBe(inexistant);
  });
});

describe('isPubliclyReadable — surfaces rattachées par URL en TEXTE', () => {
  it('un asset marqué PUBLIC se sert sans jeton, même sans aucune relation', async () => {
    // LE CAS QUI A ÉTÉ DÉCOUVERT SUR STAGING, et qui aurait cassé la prod.
    //
    // `Club.logoUrl` est une chaîne, pas une clé étrangère : le logo du SKSR
    // n'est référencé par AUCUNE relation. Un contrôle fondé sur les seules
    // relations l'aurait donc jugé privé, et il serait passé en 404 sur la
    // vitrine, les factures et les mails.
    const LOGO: Asset = {
      id: 'a-logo',
      clubId: 'club-1',
      storagePath: 'p/logo.svg',
      publicRefs: 0, // aucune relation — c'est tout le sujet
      visibility: 'PUBLIC',
    };
    const { svc } = makeSvc([LOGO]);

    const r = await svc.streamFor('a-logo', { clubId: null });

    expect(r.isPublic).toBe(true);
  });

  it('un asset PRIVÉ sans relation reste refusé', async () => {
    // Le pendant : marquer public ne doit pas devenir le défaut. Un
    // justificatif comptable n'a lui non plus aucune relation publique.
    const { svc } = makeSvc([JUSTIFICATIF]);

    await expect(svc.streamFor('a-prive', { clubId: null })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('isPubliclyReadable — LE PRIVÉ L’EMPORTE', () => {
  it('un fichier à la fois logo ET justificatif comptable reste REFUSÉ', async () => {
    // Faille trouvée en vérifiant le rattrapage sur staging : l'asset pioché
    // au hasard était candidat au logo ET rattaché à un AccountingDocument.
    // Le `OU` faisait gagner PUBLIC inconditionnellement, et la facture est
    // passée en 200 en lecture anonyme.
    const MIXTE: Asset = {
      id: 'a-mixte',
      clubId: 'club-1',
      storagePath: 'p/mixte.jpg',
      publicRefs: 1, // désigné par la galerie
      privateRefs: 1, // ET attaché à une facture
      visibility: 'PUBLIC', // ET marqué public à l'upload
    };
    const { svc, storage } = makeSvc([MIXTE]);

    await expect(svc.streamFor('a-mixte', { clubId: null })).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('le club propriétaire y accède quand même', async () => {
    // Le pendant : refuser à tout le monde casserait la comptabilité.
    const MIXTE: Asset = {
      id: 'a-mixte',
      clubId: 'club-1',
      storagePath: 'p/mixte.jpg',
      publicRefs: 1,
      privateRefs: 1,
      visibility: 'PUBLIC',
    };
    const { svc } = makeSvc([MIXTE]);

    const r = await svc.streamFor('a-mixte', { clubId: 'club-1' });

    expect(r.isPublic).toBe(false);
  });
});

describe('isPubliclyReadable — refus par défaut', () => {
  it('un asset rattaché à AUCUNE surface publique est privé', async () => {
    const { svc } = makeSvc([JUSTIFICATIF]);
    await expect(svc.isPubliclyReadable('a-prive')).resolves.toBe(false);
  });

  it('un asset inconnu est privé, pas public', async () => {
    // Le sens du défaut compte : `false` sur un asset absent évite qu'une
    // erreur de lecture ouvre un fichier.
    const { svc } = makeSvc([]);
    await expect(svc.isPubliclyReadable('a-inconnu')).resolves.toBe(false);
  });
});

/**
 * Un asset désigné par une section de page vitrine n'est relié à la page par
 * AUCUNE clé étrangère : c'est une URL en texte dans `sectionsJson`. Seul
 * `visibility` peut le couvrir. Constaté en prod le 2026-08-25 — la photo du
 * sensei sur sksr.re/equipe s'affichait en mode édition (JWT présent) et
 * sortait en 404 chez le visiteur.
 */
describe('markPublic — rattrapage d’un asset déjà uploadé', () => {
  const SECTION_VITRINE = (): Asset => ({
    id: 'a-section',
    clubId: 'club-1',
    storagePath: 'p/sensei.jpg',
    publicRefs: 0, // aucune FK : l'URL vit dans sectionsJson
    visibility: 'PRIVATE',
  });

  it('un asset sans FK publique sort en 404 chez le visiteur', async () => {
    const { svc, storage } = makeSvc([SECTION_VITRINE()]);

    await expect(svc.streamFor('a-section', { clubId: null })).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('après markPublic, le même asset se sert sans jeton', async () => {
    const { svc } = makeSvc([SECTION_VITRINE()]);

    await expect(svc.markPublic('club-1', 'a-section')).resolves.toBe(true);

    const r = await svc.streamFor('a-section', { clubId: null });
    expect(r.isPublic).toBe(true);
  });

  it('un autre club ne rend pas public le fichier d’autrui', async () => {
    const asset = SECTION_VITRINE();
    const { svc, storage } = makeSvc([asset]);

    await expect(svc.markPublic('club-2', 'a-section')).resolves.toBe(false);

    // Ce que le booléen seul ne dit pas : rien n'a bougé côté lecture.
    await expect(svc.streamFor('a-section', { clubId: null })).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('un asset inconnu renvoie false, sans rien créer', async () => {
    const { svc } = makeSvc([]);
    await expect(svc.markPublic('club-1', 'a-inconnu')).resolves.toBe(false);
  });

  it('rendre public ne rouvre pas une pièce rattachée à une facture', async () => {
    // La précédence du privé doit survivre à un markPublic : un trésorier qui
    // choisit comme image de section un fichier déjà attaché à un
    // justificatif ne doit pas ouvrir la facture au monde.
    const MIXTE: Asset = {
      id: 'a-mixte-2',
      clubId: 'club-1',
      storagePath: 'p/facture-et-photo.jpg',
      publicRefs: 0,
      privateRefs: 1,
      visibility: 'PRIVATE',
    };
    const { svc, storage } = makeSvc([MIXTE]);

    await expect(svc.markPublic('club-1', 'a-mixte-2')).resolves.toBe(true);

    await expect(svc.streamFor('a-mixte-2', { clubId: null })).rejects.toThrow(
      NotFoundException,
    );
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });
});
