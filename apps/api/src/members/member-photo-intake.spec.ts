import { BadRequestException } from '@nestjs/common';
import type { MediaAssetsService } from '../media/media-assets.service';
import {
  MEMBER_PHOTO_DATA_URL_MAX,
  absorberPhotoMembre,
  isDataUrl,
} from './member-photo-intake';

/**
 * Ce que ce garde-fou protège : plus aucune image en base64 n'atteint
 * `Member.photoUrl`. L'admin recadre dans un canvas et envoie une data URL ;
 * 39 fiches de production en portaient une, de 29 000 à 71 000 caractères,
 * transportées à chaque lecture de profil et refusées par le portail.
 *
 * La conversion est au point d'écriture, pas dans le client : un nouvel
 * appelant ne peut pas l'oublier.
 */

const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a',
  'base64',
);
const DATA_URL = `data:image/jpeg;base64,${PIXEL.toString('base64')}`;

function media() {
  const uploadImage = jest.fn(
    async (
      clubId: string,
      _userId: string | null,
      file: { buffer: Buffer; mimetype: string },
    ) => ({
      publicUrl: `https://api.test/media/asset-${clubId}`,
      id: 'asset',
      mimeType: file.mimetype,
      sizeBytes: file.buffer.length,
    }),
  );
  return {
    double: { uploadImage } as unknown as Pick<MediaAssetsService, 'uploadImage'>,
    uploadImage,
  };
}

describe('absorberPhotoMembre', () => {
  it('convertit une data URL en média et rend son URL', async () => {
    const m = media();

    const url = await absorberPhotoMembre(m.double, 'club-1', null, DATA_URL);

    expect(url).toBe('https://api.test/media/asset-club-1');
    expect(m.uploadImage).toHaveBeenCalledTimes(1);
    const [clubId, , fichier] = m.uploadImage.mock.calls[0];
    expect(clubId).toBe('club-1');
    expect(fichier.mimetype).toBe('image/jpeg');
    expect(Buffer.compare(fichier.buffer, PIXEL)).toBe(0);
  });

  it('laisse passer une URL déjà correcte, sans rien uploader', async () => {
    const m = media();
    const url = 'https://api.test/media/deja-la';

    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, url),
    ).resolves.toBe(url);
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it('distingue « ne pas toucher » de « effacer »', async () => {
    const m = media();

    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, undefined),
    ).resolves.toBeUndefined();
    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, null),
    ).resolves.toBeNull();
    await expect(absorberPhotoMembre(m.double, 'club-1', null, '')).resolves.toBe(
      '',
    );
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it('refuse une image inline démesurée plutôt que de la stocker', async () => {
    const m = media();
    const enorme = `data:image/jpeg;base64,${'A'.repeat(MEMBER_PHOTO_DATA_URL_MAX)}`;

    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, enorme),
    ).rejects.toThrow(BadRequestException);
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it('refuse une data URL illisible ou vide', async () => {
    const m = media();

    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, 'data:image/jpeg;base64,'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, 'data:texte-sans-virgule'),
    ).rejects.toThrow(BadRequestException);
  });

  it('n’avale pas une data URL non base64 : elle ne porte pas d’image', async () => {
    const m = media();

    await expect(
      absorberPhotoMembre(m.double, 'club-1', null, 'data:text/plain,bonjour'),
    ).rejects.toThrow(BadRequestException);
    expect(m.uploadImage).not.toHaveBeenCalled();
  });
});

describe('isDataUrl', () => {
  it('reconnaît une data URL, quelle que soit la casse ou l’espace', () => {
    expect(isDataUrl(DATA_URL)).toBe(true);
    expect(isDataUrl('  DATA:image/png;base64,AAA')).toBe(true);
  });

  it('ne confond pas une URL http avec une data URL', () => {
    expect(isDataUrl('https://api.test/media/abc')).toBe(false);
    expect(isDataUrl('/uploads/photo.jpg')).toBe(false);
  });
});
