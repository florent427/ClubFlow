import type { Readable } from 'stream';

/**
 * Abstraction du stockage des médias — permet de switcher entre disque local
 * (Phase 1) et S3/R2 (Phase 2) sans toucher au reste du code.
 *
 * La clé (`key`) est relative à la racine du stockage (pas de `/` initial) :
 *   `clubs/<clubId>/media/<uuid>.webp`
 *
 * L'adapter ne sait rien du MediaAsset Prisma ; le service au-dessus persiste
 * les métadonnées (fileName, mimeType, widthPx…) en DB et ne délègue à
 * l'adapter que la gestion binaire.
 */
export interface MediaStorageAdapter {
  /** Stocke un buffer. Retourne la `key` utilisée (identique à celle passée). */
  putObject(key: string, buffer: Buffer, mimeType: string): Promise<void>;

  /** Ouvre un stream en lecture. `null` si la clé n'existe pas. */
  getObjectStream(key: string): Promise<Readable | null>;

  /** Retourne true si l'objet existe. */
  exists(key: string): Promise<boolean>;

  /** Supprime un objet. Idempotent : succès silencieux si absent. */
  deleteObject(key: string): Promise<void>;

  /**
   * URL publique pour le navigateur (optionnel — retourne null si l'objet
   * est toujours servi via `GET /media/:id` côté API). Les adapters S3/CDN
   * peuvent retourner une URL signée ou publique directe.
   */
  publicUrl(key: string): string | null;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
