import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import sharp from 'sharp';
import type { Readable } from 'stream';
import type { MediaAsset, MediaAssetKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorageAdapter } from './media-storage.interface';

/**
 * Service générique d'upload de médias (images et documents).
 *
 * Généralise l'ancien `EventAttachmentsService` pour couvrir tous les
 * usages ClubFlow : pièces d'événements, couvertures d'articles, photos
 * de galerie vitrine, images OG, etc.
 *
 * Stockage sur disque (dossier `UPLOADS_DIR/clubs/<clubId>/media/<uuid><ext>`),
 * métadonnées en base (`MediaAsset`).
 *
 * Les images ne sont pas redimensionnées en Phase 1 (pas de dépendance
 * `sharp` pour éviter un gros binaire natif supplémentaire). Elles sont
 * stockées telles quelles et servies via `/media/:id`. Le resize + WebP
 * sera ajouté en Phase 2 (voir TODO en bas du fichier).
 */
@Injectable()
export class MediaAssetsService {
  private readonly logger = new Logger('MediaAssetsService');

  /** Taille max par upload (10 Mo — aligné avec l'ancien EventAttachments). */
  static readonly MAX_BYTES = 10 * 1024 * 1024;
  /** Dimensions cibles max après resize (évite les images énormes). */
  static readonly MAX_IMAGE_WIDTH = 2000;
  static readonly MAX_IMAGE_HEIGHT = 2000;

  /** MIME acceptés côté upload. */
  static readonly ALLOWED_IMAGE_MIME = new Set<string>([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ]);
  static readonly ALLOWED_DOCUMENT_MIME = new Set<string>(['application/pdf']);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorageAdapter,
  ) {}

  private storageKey(clubId: string, assetId: string, ext: string): string {
    return `clubs/${clubId}/media/${assetId}${ext}`;
  }

  private publicUrlForAsset(assetId: string, key: string): string {
    // Si l'adapter expose une URL directe (CDN S3), on la privilégie.
    const direct = this.storage.publicUrl(key);
    if (direct) return direct;
    const base =
      process.env.API_PUBLIC_URL?.replace(/\/+$/, '') ??
      'http://localhost:3000';
    return `${base}/media/${assetId}`;
  }

  /**
   * Upload d'une image. Validation MIME + taille, stockage + insertion DB.
   */
  async uploadImage(
    clubId: string,
    userId: string | null,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    owner?: { kind: string; id: string } | null,
  ): Promise<MediaAsset> {
    return this.uploadGeneric(clubId, userId, file, 'IMAGE', owner);
  }

  /** Upload d'un document (PDF…). */
  async uploadDocument(
    clubId: string,
    userId: string | null,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    owner?: { kind: string; id: string } | null,
  ): Promise<MediaAsset> {
    return this.uploadGeneric(clubId, userId, file, 'DOCUMENT', owner);
  }

  private async uploadGeneric(
    clubId: string,
    userId: string | null,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    kind: MediaAssetKind,
    owner?: { kind: string; id: string } | null,
  ): Promise<MediaAsset> {
    if (!file || !file.buffer || file.size <= 0) {
      throw new BadRequestException('Fichier vide.');
    }
    if (file.size > MediaAssetsService.MAX_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux (max ${MediaAssetsService.MAX_BYTES / (1024 * 1024)} Mo).`,
      );
    }
    const allowed =
      kind === 'IMAGE'
        ? MediaAssetsService.ALLOWED_IMAGE_MIME
        : MediaAssetsService.ALLOWED_DOCUMENT_MIME;
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé (${file.mimetype}).`,
      );
    }
    // S'assurer que le club existe — empêche qu'un bug amont n'écrive des
    // fichiers pour un clubId fantoche.
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club introuvable');

    const id = randomUUID();

    // Résultat final (extension, taille, MIME, dimensions).
    let finalExt = (extname(file.originalname) || '').toLowerCase().slice(0, 8);
    let finalMime = file.mimetype;
    let finalBuffer = file.buffer;
    let widthPx: number | null = null;
    let heightPx: number | null = null;

    // Pipeline sharp pour les images raster (on conserve SVG tel quel).
    const shouldResize =
      kind === 'IMAGE' &&
      file.mimetype !== 'image/svg+xml' &&
      file.mimetype !== 'image/gif';
    if (shouldResize) {
      try {
        const pipeline = sharp(file.buffer, { failOn: 'none' })
          .rotate()
          .resize({
            width: MediaAssetsService.MAX_IMAGE_WIDTH,
            height: MediaAssetsService.MAX_IMAGE_HEIGHT,
            fit: 'inside',
            withoutEnlargement: true,
          });
        const out = await pipeline
          .webp({ quality: 82, effort: 4 })
          .toBuffer({ resolveWithObject: true });
        finalBuffer = out.data;
        finalMime = 'image/webp';
        finalExt = '.webp';
        widthPx = out.info.width;
        heightPx = out.info.height;
      } catch (err) {
        this.logger.warn(
          `sharp resize failed (${file.originalname}) : ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const key = this.storageKey(clubId, id, finalExt);
    await this.storage.putObject(key, finalBuffer, finalMime);

    const row = await this.prisma.mediaAsset.create({
      data: {
        id,
        clubId,
        kind,
        ownerKind: owner?.kind ?? null,
        ownerId: owner?.id ?? null,
        fileName: file.originalname.slice(0, 255),
        mimeType: finalMime,
        sizeBytes: finalBuffer.byteLength,
        storagePath: key,
        publicUrl: this.publicUrlForAsset(id, key),
        widthPx,
        heightPx,
        uploadedByUserId: userId,
      },
    });
    return row;
  }

  async get(clubId: string, assetId: string): Promise<MediaAsset> {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, clubId },
    });
    if (!row) throw new NotFoundException('Asset introuvable');
    return row;
  }

  /** Lookup public (sans clubId) — utilisé par le controller GET /media/:id. */
  async getPublic(assetId: string): Promise<MediaAsset> {
    const row = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });
    if (!row) throw new NotFoundException('Asset introuvable');
    return row;
  }

  async streamFor(assetId: string): Promise<{
    row: MediaAsset;
    stream: Readable;
  }> {
    const row = await this.getPublic(assetId);
    const stream = await this.storage.getObjectStream(row.storagePath);
    if (!stream) {
      throw new NotFoundException('Fichier absent du stockage');
    }
    return { row, stream };
  }

  async delete(clubId: string, assetId: string): Promise<boolean> {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, clubId },
    });
    if (!row) return false;
    await this.storage.deleteObject(row.storagePath);
    await this.prisma.mediaAsset.delete({ where: { id: row.id } });
    return true;
  }

  async listByClub(
    clubId: string,
    filters?: {
      kind?: MediaAssetKind;
      ownerKind?: string;
      ownerId?: string;
    },
  ): Promise<MediaAsset[]> {
    const where: Prisma.MediaAssetWhereInput = { clubId };
    if (filters?.kind) where.kind = filters.kind;
    if (filters?.ownerKind) where.ownerKind = filters.ownerKind;
    if (filters?.ownerId) where.ownerId = filters.ownerId;
    return this.prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  etag(row: { id: string; sizeBytes: number }): string {
    return createHash('sha1')
      .update(`${row.id}|${row.sizeBytes}`)
      .digest('hex');
  }
}

// TODO Phase 2 :
//  - intégrer `sharp` pour resize auto (max 2000px) + conversion WebP
//  - génération de variants (thumb 400, medium 800, full 1600)
//  - stockage S3 derrière une abstraction `MediaStorageAdapter`
