import { BadRequestException } from '@nestjs/common';
import type { MediaAssetsService } from '../media/media-assets.service';

/**
 * Absorption d'une photo de membre fournie en *data URL*.
 *
 * L'admin recadre la photo dans un canvas et en sort un `data:image/jpeg`
 * (`MemberPhotoField`), là où le portail envoie une URL de média. Sans ce
 * passage, l'image en base64 atterrissait telle quelle dans
 * `Member.photoUrl` : 39 fiches de production en portaient une, de 29 000 à
 * 71 000 caractères, transportées à chaque lecture de profil — et refusées
 * par le portail, qui plafonne ce champ à l'usage d'une URL.
 *
 * La conversion est faite ICI, au point d'écriture, et pas dans chaque
 * client : un nouvel appelant ne peut pas l'oublier.
 */

/** Ce qu'une colonne d'URL doit pouvoir contenir. Au-delà, ce n'est pas une URL. */
export const MEMBER_PHOTO_URL_MAX = 512;

/** Taille maximale de l'image inline acceptée en entrée, avant conversion. */
export const MEMBER_PHOTO_DATA_URL_MAX = 524_288;

export function isDataUrl(valeur: string): boolean {
  return /^data:/i.test(valeur.trim());
}

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+)?(;charset=[\w-]+)?(;base64)?,(.*)$/is;

/**
 * Rend l'URL à stocker. Une valeur qui n'est pas une data URL ressort
 * inchangée ; `undefined` reste `undefined` (champ non touché).
 */
export async function absorberPhotoMembre(
  media: Pick<MediaAssetsService, 'uploadImage'>,
  clubId: string,
  userId: string | null,
  valeur: string | null | undefined,
): Promise<string | null | undefined> {
  if (valeur === undefined || valeur === null) {
    return valeur;
  }
  const brut = valeur.trim();
  if (!brut || !isDataUrl(brut)) {
    return valeur;
  }
  if (brut.length > MEMBER_PHOTO_DATA_URL_MAX) {
    throw new BadRequestException(
      'Photo trop lourde : réduisez-la avant de l’enregistrer.',
    );
  }

  const m = DATA_URL.exec(brut);
  if (!m) {
    throw new BadRequestException('Photo illisible.');
  }
  const [, mime, , base64, charge] = m;
  if (!base64) {
    // Une data URL non base64 ne porte pas d'image exploitable ici.
    throw new BadRequestException('Photo illisible.');
  }
  const buffer = Buffer.from(charge, 'base64');
  if (!buffer.length) {
    throw new BadRequestException('Photo vide.');
  }

  const asset = await media.uploadImage(clubId, userId, {
    originalname: 'photo.jpg',
    mimetype: mime || 'image/jpeg',
    size: buffer.length,
    buffer,
  });
  return asset.publicUrl;
}
