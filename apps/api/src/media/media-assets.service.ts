import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import { promisify } from 'util';
import sharp from 'sharp';
// libreoffice-convert spawne la CLI `soffice` de LibreOffice en mode
// headless pour convertir PPTX/PPT/ODP → PDF (ainsi que DOCX, XLSX, etc.).
// Le binaire doit être installé sur la machine — chemin Windows par défaut :
// `C:\Program Files\LibreOffice\program\soffice.exe`.
// Si LibreOffice n'est pas disponible, la conversion échoue silencieusement
// et le flux upload retombe sur le PPTX brut (le frontend affichera alors
// Office Online Viewer comme fallback).
import * as libreConvertLib from 'libreoffice-convert';
// `file-type` v16 (CommonJS — v17+ est ESM-only et incompatible avec
// notre build NestJS). Détecte le vrai type MIME d'un buffer en
// inspectant les magic bytes — anti-spoofing : un .exe renommé .png
// est reconnu comme `application/octet-stream` et rejeté en amont.
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import type { Readable } from 'stream';
import type { MediaAsset, MediaAssetKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGE, type MediaStorageAdapter } from './media-storage.interface';

const libreConvert: (
  buffer: Buffer,
  ext: string,
  filter: string | undefined,
) => Promise<Buffer> = promisify(
  (libreConvertLib as { convert: unknown }).convert as (
    buffer: Buffer,
    ext: string,
    filter: string | undefined,
    cb: (err: Error | null, out: Buffer) => void,
  ) => void,
);

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
  static readonly ALLOWED_DOCUMENT_MIME = new Set<string>([
    'application/pdf',
    // PowerPoint / OpenDocument — rendu inline via Office Online Viewer
    // dans l'éditeur d'articles vitrine.
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.presentation',
  ]);
  static readonly ALLOWED_VIDEO_MIME = new Set<string>([
    // Formats compatibles lecture <video> dans tous les navigateurs modernes.
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime', // .mov — beaucoup d'iPhone l'exportent tel quel
  ]);
  /**
   * MIME audio acceptés — pour les messages vocaux de la messagerie.
   * `audio/mp4` couvre m4a (sortie d'expo-av sur iOS).
   * `audio/mpeg` = mp3.
   * `audio/ogg` + `audio/webm` = formats opus / vorbis utilisés par Android.
   */
  static readonly ALLOWED_AUDIO_MIME = new Set<string>([
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
  ]);
  /**
   * Taille max pour les gros fichiers (vidéos, présentations). Plus souple
   * que la limite standard car ces médias sont lourds par nature. Le frontend
   * prévient l'utilisateur au-delà et un reverse-proxy peut serrer la vis si
   * besoin en production.
   */
  static readonly MAX_LARGE_BYTES = 100 * 1024 * 1024;

  /**
   * Limites taille **strictes** appliquées aux uploads chat (pièces jointes
   * de messagerie). Plus serrées que les limites legacy pour éviter de
   * faire exploser la bande passante mobile et les coûts de stockage.
   * Spec utilisateur : "images 5MB, PDF 10MB, vidéos 50MB, vocal 10MB".
   */
  static readonly CHAT_LIMITS_BY_KIND: Record<MediaAssetKind, number> = {
    IMAGE: 5 * 1024 * 1024,
    DOCUMENT: 10 * 1024 * 1024,
    VIDEO: 50 * 1024 * 1024,
    AUDIO: 10 * 1024 * 1024,
    OTHER: 5 * 1024 * 1024,
  };

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
   * Réécrit une URL `publicUrl` stockée en base pour la rendre joignable
   * depuis le client courant.
   *
   * Cas d'usage : si l'API a démarré sans `API_PUBLIC_URL` (déploiement
   * mal configuré), les uploads ont été persistés avec
   * `http://localhost:3000/media/<id>` — non joignable depuis un browser
   * distant. Ce helper permet de "fixer" la valeur lue côté resolvers
   * sans forcer une migration DB. Idempotent : laisse intactes les URLs
   * S3/CDN ou déjà conformes.
   *
   * Appelé par les resolvers qui exposent `mediaAssetUrl` au front
   * (documents, vitrine, chat…) — voir `documentToGraph` etc.
   */
  resolvePublicUrl(stored: string | null | undefined): string | null {
    if (!stored) return null;
    const explicit = process.env.API_PUBLIC_URL?.replace(/\/+$/, '');
    if (!explicit) return stored;
    // Rewrite tout préfixe `http://localhost:<port>` ou `http://127.0.0.1:<port>`
    // vers l'URL publique configurée. Tolère un éventuel slash trailing.
    return stored.replace(
      /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?/,
      explicit,
    );
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

  /** Upload d'un document (PDF, PPTX…). */
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

  /**
   * Upload spécifique d'une présentation (PPTX / PPT / ODP) avec conversion
   * PDF automatique via LibreOffice headless.
   *
   * Renvoie toujours l'asset PPTX source ; l'asset PDF est optionnel — si
   * LibreOffice n'est pas installé ou échoue, on log et on continue avec
   * juste le PPTX (le frontend affichera Office Online Viewer en fallback).
   *
   * Le PDF est un `MediaAsset` indépendant (kind=DOCUMENT, mimeType=
   * application/pdf) lié via `ownerKind='PPTX_PDF_PREVIEW'` +
   * `ownerId=<pptx-asset-id>` pour pouvoir le retrouver et le nettoyer
   * quand le PPTX source est supprimé.
   */
  async uploadPresentationWithPdf(
    clubId: string,
    userId: string | null,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    owner?: { kind: string; id: string } | null,
  ): Promise<{ source: MediaAsset; pdf: MediaAsset | null }> {
    const source = await this.uploadDocument(clubId, userId, file, owner);

    // Tentative de conversion PPTX → PDF. On isole dans un try/catch : toute
    // erreur (LibreOffice absent, fichier corrompu, format non supporté) est
    // non-bloquante — l'utilisateur gardera au minimum le téléchargement.
    try {
      const pdfBuffer = await libreConvert(file.buffer, '.pdf', undefined);
      if (!pdfBuffer || pdfBuffer.length === 0) {
        this.logger.warn(
          `PPTX→PDF conversion yielded empty buffer (${file.originalname}).`,
        );
        return { source, pdf: null };
      }
      const pdfId = randomUUID();
      const pdfKey = this.storageKey(clubId, pdfId, '.pdf');
      await this.storage.putObject(pdfKey, pdfBuffer, 'application/pdf');
      const pdfName = file.originalname
        .replace(/\.(pptx?|odp)$/i, '')
        .concat('.pdf');
      const pdf = await this.prisma.mediaAsset.create({
        data: {
          id: pdfId,
          clubId,
          kind: 'DOCUMENT',
          ownerKind: 'PPTX_PDF_PREVIEW',
          ownerId: source.id,
          fileName: pdfName.slice(0, 255),
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.byteLength,
          storagePath: pdfKey,
          publicUrl: this.publicUrlForAsset(pdfId, pdfKey),
          widthPx: null,
          heightPx: null,
          uploadedByUserId: userId,
        },
      });
      return { source, pdf };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `PPTX→PDF conversion failed (${file.originalname}) — fallback Office viewer. ` +
          `Cause : ${msg}. ` +
          "Vérifie que LibreOffice est installé (Windows : " +
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe).',
      );
      return { source, pdf: null };
    }
  }

  /**
   * Upload d'une vidéo (MP4/WebM/OGG/MOV). Kind = `VIDEO`.
   * Note : pas de re-encoding ffmpeg pour l'instant (gracieusement
   * ignoré si le binaire n'est pas dispo en dev Windows). À ajouter
   * en v2 pour stripper les métadonnées et standardiser H264/AAC.
   */
  async uploadVideo(
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
    return this.uploadGeneric(clubId, userId, file, 'VIDEO', owner);
  }

  /**
   * Upload d'un message vocal / audio. Kind = `AUDIO`. Limite
   * stricte 10 Mo (cf. CHAT_LIMITS_BY_KIND.AUDIO).
   */
  async uploadAudio(
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
    return this.uploadGeneric(clubId, userId, file, 'AUDIO', owner);
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
    // Limite par kind. Images et audio restent serrés ; document/vidéo
    // plus permissifs (capés à 100 Mo via MAX_LARGE_BYTES historique).
    let sizeLimit: number;
    switch (kind) {
      case 'IMAGE':
      case 'AUDIO':
        sizeLimit = MediaAssetsService.MAX_BYTES; // 10 Mo
        break;
      default:
        sizeLimit = MediaAssetsService.MAX_LARGE_BYTES; // 100 Mo
    }
    if (file.size > sizeLimit) {
      throw new BadRequestException(
        `Fichier trop volumineux (max ${sizeLimit / (1024 * 1024)} Mo).`,
      );
    }
    let allowed: Set<string>;
    switch (kind) {
      case 'IMAGE':
        allowed = MediaAssetsService.ALLOWED_IMAGE_MIME;
        break;
      case 'DOCUMENT':
        allowed = MediaAssetsService.ALLOWED_DOCUMENT_MIME;
        break;
      case 'VIDEO':
      case 'OTHER':
        // OTHER conserve la whitelist vidéo pour rétro-compat (anciens
        // uploads). Les nouveaux uploads vidéos passent par kind=VIDEO
        // depuis `uploadVideo`.
        allowed = MediaAssetsService.ALLOWED_VIDEO_MIME;
        break;
      case 'AUDIO':
        allowed = MediaAssetsService.ALLOWED_AUDIO_MIME;
        break;
      default:
        allowed = new Set();
    }
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé (${file.mimetype}).`,
      );
    }
    // **Vérification magic-byte** — anti-spoofing. Le client peut
    // facilement renommer un .exe en .png et changer le Content-Type ;
    // on inspecte les premiers octets du buffer pour détecter le vrai
    // type MIME. Si mismatch → reject. SVG est XML donc pas détectable
    // par signature binaire — on l'exempte (sécurité texte gérée par
    // sharp + sanitization aval éventuelle).
    if (file.mimetype !== 'image/svg+xml') {
      try {
        const detected = await fileTypeFromBuffer(file.buffer);
        if (detected) {
          // Tolérance MIME : audio/mp4 ↔ video/mp4 (M4A est techniquement
          // un container MP4 ; file-type peut renvoyer l'un ou l'autre).
          // Pareil pour audio/mpeg vs audio/mp3.
          const mimeMatch =
            detected.mime === file.mimetype ||
            (detected.mime === 'video/mp4' && file.mimetype === 'audio/mp4') ||
            (detected.mime === 'audio/mp4' && file.mimetype === 'video/mp4');
          if (!mimeMatch && allowed.has(detected.mime)) {
            // Le fichier est valide mais le client a déclaré un autre MIME
            // → on accepte mais on log pour audit.
            this.logger.warn(
              `MIME corrigé : déclaré=${file.mimetype}, détecté=${detected.mime} (${file.originalname})`,
            );
            file.mimetype = detected.mime;
          } else if (!mimeMatch) {
            throw new BadRequestException(
              `Contenu du fichier ne correspond pas au type déclaré ` +
                `(déclaré=${file.mimetype}, détecté=${detected.mime}).`,
            );
          }
        }
        // Si `detected` est undefined (file-type ne reconnaît pas), on
        // tolère pour les formats text/SVG/etc. — la whitelist MIME
        // déclarée a déjà filtré.
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // file-type peut throw sur des buffers corrompus — log + continue
        // pour ne pas bloquer le flux upload sur une lib externe.
        this.logger.warn(
          `Magic-byte check échoué (${file.originalname}) : ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
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
