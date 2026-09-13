import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaVisibility } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import type { ShopStockService } from './shop-stock.service';
import { ShopService } from './shop.service';

/**
 * Mise en ligne des CGV de la boutique (ADR-0017).
 *
 * Ce qui compte : le PDF appartient au club, il devient lisible sans jeton
 * (l'adhérent l'ouvre dans un onglet), et la date de la version en vigueur dit
 * depuis quand les adhérents l'acceptent. Le double applique les clauses
 * présentes du `where` et annule les écritures d'une transaction qui lève,
 * comme PostgreSQL.
 */

type Asset = {
  id: string;
  clubId: string;
  mimeType: string;
  fileName: string;
  publicUrl: string;
  visibility: MediaVisibility;
};
type ClubRow = {
  id: string;
  shopTermsAssetId: string | null;
  shopTermsUpdatedAt: Date | null;
};

const ANCIENNE_DATE = new Date('2026-09-01T08:00:00Z');

function pdf(id: string, clubId = 'club-1'): Asset {
  return {
    id,
    clubId,
    mimeType: 'application/pdf',
    fileName: `${id}.pdf`,
    publicUrl: `https://api.test/media/${id}`,
    visibility: MediaVisibility.PRIVATE,
  };
}

function makeHarness(seed: { assets: Asset[]; club?: Partial<ClubRow> }) {
  const assets = seed.assets;
  const clubs: ClubRow[] = [
    { id: 'club-1', shopTermsAssetId: null, shopTermsUpdatedAt: null, ...seed.club },
    { id: 'club-2', shopTermsAssetId: null, shopTermsUpdatedAt: null },
  ];
  const assetMatches = (a: Asset, where: any) =>
    (where.id === undefined || a.id === where.id) &&
    (where.clubId === undefined || a.clubId === where.clubId);

  const db: any = {
    mediaAsset: {
      findFirst: jest.fn(async ({ where }: any) => {
        const a = assets.find((x) => assetMatches(x, where));
        return a ? { ...a } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = assets.filter((x) => assetMatches(x, where));
        hit.forEach((a) => Object.assign(a, data));
        return { count: hit.length };
      }),
    },
    club: {
      findUnique: jest.fn(async ({ where, select }: any) => {
        const c = clubs.find((x) => x.id === where.id);
        if (!c) return null;
        const asset = assets.find((a) => a.id === c.shopTermsAssetId) ?? null;
        return {
          ...c,
          shopTermsAsset:
            select?.shopTermsAsset && asset
              ? { id: asset.id, fileName: asset.fileName, publicUrl: asset.publicUrl }
              : null,
        };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const c = clubs.find((x) => x.id === where.id);
        if (!c) throw new Error('club introuvable');
        Object.assign(c, data);
        return { ...c };
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = structuredClone({ assets, clubs });
      try {
        return await fn(db);
      } catch (e) {
        assets.splice(0, assets.length, ...snap.assets);
        clubs.splice(0, clubs.length, ...snap.clubs);
        throw e;
      }
    }),
  };

  const svc = new ShopService(
    db as unknown as PrismaService,
    {} as unknown as ShopStockService,
    {} as unknown as ShopPurchaseOrdersService,
  );
  return { svc, assets, club: () => clubs[0] };
}

describe('ShopService.setShopTerms — mise en ligne des CGV', () => {
  it('met en ligne un PDF du club : désigné, daté, et rendu PUBLIC', async () => {
    const h = makeHarness({ assets: [pdf('a-cgv')] });

    const vue = await h.svc.setShopTerms('club-1', 'a-cgv');

    expect(h.club().shopTermsAssetId).toBe('a-cgv');
    expect(h.club().shopTermsUpdatedAt).toBeInstanceOf(Date);
    // Sans cela, l'adhérent accepterait un lien qui répond 404.
    expect(h.assets[0].visibility).toBe(MediaVisibility.PUBLIC);
    expect(vue).toEqual({
      id: 'a-cgv',
      fileName: 'a-cgv.pdf',
      url: 'https://api.test/media/a-cgv',
      updatedAt: h.club().shopTermsUpdatedAt,
    });
  });

  it('REFUSE le PDF d’un autre club, et ne le rend pas public', async () => {
    const h = makeHarness({ assets: [pdf('a-etranger', 'club-2')] });

    await expect(h.svc.setShopTerms('club-1', 'a-etranger')).rejects.toThrow(
      NotFoundException,
    );

    expect(h.club().shopTermsAssetId).toBeNull();
    expect(h.assets[0].visibility).toBe(MediaVisibility.PRIVATE);
  });

  it('REFUSE un fichier qui n’est pas un PDF', async () => {
    const image = { ...pdf('a-image'), mimeType: 'image/png' };
    const h = makeHarness({ assets: [image] });

    await expect(h.svc.setShopTerms('club-1', 'a-image')).rejects.toThrow(
      BadRequestException,
    );

    expect(h.club().shopTermsAssetId).toBeNull();
    expect(h.assets[0].visibility).toBe(MediaVisibility.PRIVATE);
  });

  it('remplacer : la nouvelle version est datée, l’ancienne reste lisible', async () => {
    const h = makeHarness({
      assets: [
        { ...pdf('a-v1'), visibility: MediaVisibility.PUBLIC },
        pdf('a-v2'),
      ],
      club: { shopTermsAssetId: 'a-v1', shopTermsUpdatedAt: ANCIENNE_DATE },
    });

    await h.svc.setShopTerms('club-1', 'a-v2');

    expect(h.club().shopTermsAssetId).toBe('a-v2');
    expect(h.club().shopTermsUpdatedAt!.getTime()).toBeGreaterThan(
      ANCIENNE_DATE.getTime(),
    );
    // La preuve des commandes passées sous la v1 reste accessible.
    expect(h.assets.find((a) => a.id === 'a-v1')?.visibility).toBe(
      MediaVisibility.PUBLIC,
    );
  });

  it('re-désigner la version en vigueur ne la redate pas', async () => {
    const h = makeHarness({
      assets: [{ ...pdf('a-v1'), visibility: MediaVisibility.PUBLIC }],
      club: { shopTermsAssetId: 'a-v1', shopTermsUpdatedAt: ANCIENNE_DATE },
    });

    await h.svc.setShopTerms('club-1', 'a-v1');

    expect(h.club().shopTermsUpdatedAt).toEqual(ANCIENNE_DATE);
  });

  it('retirer : plus aucune CGV en vigueur', async () => {
    const h = makeHarness({
      assets: [{ ...pdf('a-v1'), visibility: MediaVisibility.PUBLIC }],
      club: { shopTermsAssetId: 'a-v1', shopTermsUpdatedAt: ANCIENNE_DATE },
    });

    await expect(h.svc.setShopTerms('club-1', null)).resolves.toBeNull();

    expect(h.club().shopTermsAssetId).toBeNull();
    expect(h.club().shopTermsUpdatedAt).toBeNull();
    await expect(h.svc.getShopTerms('club-1')).resolves.toBeNull();
  });
});
