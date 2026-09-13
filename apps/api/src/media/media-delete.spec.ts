import { MediaAssetsService } from './media-assets.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Supprimer un média.
 *
 * Deux faits décident, et le double les simule sans inspecter la forme des
 * requêtes : ce qui désigne encore l'asset — CGV en vigueur d'un club,
 * commandes qui les ont acceptées (ADR-0017) — et l'ORDRE dans lequel la base
 * et le stockage sont touchés. Effacer le fichier avant qu'une clé étrangère
 * refuse la suppression perdait la preuve, sans aucune erreur visible.
 */

type Asset = { id: string; clubId: string; storagePath: string };
type ClubRow = { id: string; shopTermsAssetId: string | null };
type OrderRow = { id: string; clubId: string; termsAssetId: string | null };

function makeSvc(seed: {
  assets: Asset[];
  clubs?: ClubRow[];
  orders?: OrderRow[];
}) {
  const assets = [...seed.assets];
  const clubs = seed.clubs ?? [];
  const orders = seed.orders ?? [];
  /** Ordre réel des effacements : base et stockage. */
  const journal: string[] = [];

  // Doubles écrits EN FACE des requêtes : seules les clauses présentes filtrent.
  const prisma = {
    mediaAsset: {
      findFirst: jest.fn(
        async ({ where }: { where: { id?: string; clubId?: string } }) =>
          assets.find(
            (a) =>
              (where.id === undefined || a.id === where.id) &&
              (where.clubId === undefined || a.clubId === where.clubId),
          ) ?? null,
      ),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        // La clé étrangère NoAction : la base refuse d'effacer un PDF désigné.
        const designe =
          clubs.some((c) => c.shopTermsAssetId === where.id) ||
          orders.some((o) => o.termsAssetId === where.id);
        if (designe) throw new Error('Foreign key constraint violated');
        journal.push(`base:${where.id}`);
        const i = assets.findIndex((a) => a.id === where.id);
        return assets.splice(i, 1)[0];
      }),
    },
    club: {
      count: jest.fn(
        async ({
          where,
        }: {
          where: { id?: string; shopTermsAssetId?: string };
        }) =>
          clubs.filter(
            (c) =>
              (where.id === undefined || c.id === where.id) &&
              (where.shopTermsAssetId === undefined ||
                c.shopTermsAssetId === where.shopTermsAssetId),
          ).length,
      ),
    },
    shopOrder: {
      count: jest.fn(
        async ({
          where,
        }: {
          where: { clubId?: string; termsAssetId?: string };
        }) =>
          orders.filter(
            (o) =>
              (where.clubId === undefined || o.clubId === where.clubId) &&
              (where.termsAssetId === undefined ||
                o.termsAssetId === where.termsAssetId),
          ).length,
      ),
    },
  };
  const storage = {
    deleteObject: jest.fn(async (path: string) => {
      journal.push(`fichier:${path}`);
    }),
  };
  const svc = new MediaAssetsService(
    prisma as unknown as PrismaService,
    storage as never,
  );
  return { svc, prisma, storage, assets, journal };
}

const CGV: Asset = { id: 'a-cgv', clubId: 'club-1', storagePath: 'p/cgv.pdf' };
const PHOTO: Asset = {
  id: 'a-photo',
  clubId: 'club-1',
  storagePath: 'p/photo.jpg',
};

describe('MediaAssetsService.delete — les CGV de la boutique sont une preuve', () => {
  it('REFUSE le PDF des CGV en vigueur, sans toucher ni la base ni le fichier', async () => {
    const h = makeSvc({
      assets: [CGV],
      clubs: [{ id: 'club-1', shopTermsAssetId: 'a-cgv' }],
    });

    await expect(h.svc.delete('club-1', 'a-cgv')).rejects.toThrow(
      /en ligne comme conditions générales de vente/,
    );

    expect(h.assets).toHaveLength(1);
    expect(h.storage.deleteObject).not.toHaveBeenCalled();
  });

  it('REFUSE une ancienne version, acceptée sur des commandes', async () => {
    const h = makeSvc({
      assets: [CGV],
      clubs: [{ id: 'club-1', shopTermsAssetId: 'a-cgv-v2' }],
      orders: [
        { id: 'o-1', clubId: 'club-1', termsAssetId: 'a-cgv' },
        { id: 'o-2', clubId: 'club-1', termsAssetId: 'a-cgv' },
      ],
    });

    await expect(h.svc.delete('club-1', 'a-cgv')).rejects.toThrow(
      /acceptées sur 2 commandes/,
    );

    expect(h.assets).toHaveLength(1);
    expect(h.storage.deleteObject).not.toHaveBeenCalled();
  });

  it('supprime un média ordinaire : la base D’ABORD, le fichier ensuite', async () => {
    const h = makeSvc({
      assets: [PHOTO, CGV],
      clubs: [{ id: 'club-1', shopTermsAssetId: 'a-cgv' }],
    });

    await expect(h.svc.delete('club-1', 'a-photo')).resolves.toBe(true);

    expect(h.journal).toEqual(['base:a-photo', 'fichier:p/photo.jpg']);
  });

  it('un refus de la BASE laisse le fichier intact', async () => {
    // Le contrôle applicatif ne voit rien — une commande acceptant ces CGV
    // arrive entre lui et la suppression. C'est la clé étrangère qui refuse,
    // et le fichier, qui partait le premier, doit survivre.
    const h = makeSvc({
      assets: [CGV],
      orders: [{ id: 'o-1', clubId: 'club-1', termsAssetId: 'a-cgv' }],
    });
    h.prisma.shopOrder.count.mockResolvedValueOnce(0);

    await expect(h.svc.delete('club-1', 'a-cgv')).rejects.toThrow(
      /Foreign key/,
    );

    expect(h.storage.deleteObject).not.toHaveBeenCalled();
    expect(h.assets).toHaveLength(1);
  });

  it('un échec du stockage, une fois la ligne supprimée, ne fait pas échouer la suppression', async () => {
    const h = makeSvc({ assets: [PHOTO] });
    h.storage.deleteObject.mockRejectedValueOnce(new Error('disque indisponible'));

    await expect(h.svc.delete('club-1', 'a-photo')).resolves.toBe(true);

    expect(h.assets).toHaveLength(0);
  });

  it('ne supprime pas le média d’un autre club', async () => {
    const h = makeSvc({ assets: [PHOTO] });

    await expect(h.svc.delete('club-2', 'a-photo')).resolves.toBe(false);

    expect(h.assets).toHaveLength(1);
    expect(h.storage.deleteObject).not.toHaveBeenCalled();
  });
});
