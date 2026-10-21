import { ReceiptOcrService } from './receipt-ocr.service';

/**
 * Lecture du fichier d'un reçu avant l'analyse IA.
 *
 * `MediaAssetsService.streamFor` ne sert un fichier privé qu'au club qui le
 * possède : appelé sans `clubId`, il répond « Asset introuvable ». Les reçus
 * étant privés, un appel sans club cassait TOUS les scans (« Analyse IA… »
 * puis rien) depuis la fermeture de l'accès anonyme aux médias (2026-07-19)
 * jusqu'au 2026-10-21. Le double ci-dessous refuse comme le vrai.
 */
describe('ReceiptOcrService — lecture du fichier du reçu', () => {
  const CLUB = 'club-1';

  function build() {
    const prisma = {
      clubModule: {
        findUnique: jest.fn(async () => ({ enabled: true })),
      },
      mediaAsset: {
        findMany: jest.fn(async () => [
          { id: 'asset-new', clubId: CLUB, sha256: 'hash-1', mimeType: 'image/jpeg' },
        ]),
        // Le même fichier a déjà été scanné : le service s'arrête sur le
        // doublon, juste APRÈS avoir lu le fichier — sans IA à simuler.
        findFirst: jest.fn(async () => ({ id: 'asset-old' })),
        update: jest.fn(),
      },
      accountingDocument: {
        findFirst: jest.fn(async () => ({ entryId: 'entry-old' })),
      },
    };
    const mediaAssets = {
      streamFor: jest.fn(
        async (_assetId: string, opts?: { clubId?: string | null }) => {
          if (opts?.clubId !== CLUB) throw new Error('Asset introuvable');
          return {
            stream: (async function* () {
              yield Buffer.from('jpeg');
            })(),
          };
        },
      ),
    };
    const service = new ReceiptOcrService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mediaAssets as never,
    );
    return { service, mediaAssets };
  }

  it('lit le fichier au nom du club qui scanne', async () => {
    const { service, mediaAssets } = build();

    const result = await service.extractFromMediaAssets(
      CLUB,
      ['asset-new'],
      'user-1',
    );

    expect(mediaAssets.streamFor).toHaveBeenCalledWith('asset-new', {
      clubId: CLUB,
    });
    expect(result.duplicateOfEntryId).toBe('entry-old');
  });
});
