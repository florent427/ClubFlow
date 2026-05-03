import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stockage + métadonnées des pièces jointes d'un événement.
 *
 * Choix de conception :
 * - Les fichiers sont sur disque (dossier `uploads/events/<eventId>/<id><ext>`),
 *   pas en base → un PDF de 8 Mo ne pollue pas Postgres, et la restauration
 *   de la DB reste rapide. Pour un passage en production multi-noeuds, il
 *   faudra remplacer par S3 (remplacer `writeFile`/`createReadStream`).
 * - La racine de stockage est configurable via `UPLOADS_DIR` (défaut
 *   `./uploads`), ce qui permet de la monter sur un volume dédié en prod.
 * - Le contrôleur applique déjà la limite de taille côté multer (10 Mo).
 *   On valide ici les types MIME : PDF + images courantes suffisent pour
 *   un usage associatif (affiches, plans d'accès, règlements).
 */
@Injectable()
export class EventAttachmentsService {
  /** Taille max en octets — dupliqué côté controller pour multer. */
  static readonly MAX_BYTES = 10 * 1024 * 1024;

  /** Types acceptés. Tout le reste est refusé. */
  static readonly ALLOWED_MIME = new Set<string>([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  private get root(): string {
    const env = process.env.UPLOADS_DIR?.trim();
    return resolve(env && env.length > 0 ? env : './uploads');
  }

  private eventDir(eventId: string): string {
    return join(this.root, 'events', eventId);
  }

  /**
   * Enregistre le fichier sur disque et crée la ligne en base.
   * Jette `BadRequestException` si MIME/size invalides.
   */
  async upload(
    clubId: string,
    eventId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    // Garde-fou : l'événement doit exister et appartenir au club courant.
    const event = await this.prisma.clubEvent.findFirst({
      where: { id: eventId, clubId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');

    if (!file || !file.buffer || file.size <= 0) {
      throw new BadRequestException('Fichier vide.');
    }
    if (file.size > EventAttachmentsService.MAX_BYTES) {
      throw new BadRequestException(
        `Fichier trop volumineux (max ${EventAttachmentsService.MAX_BYTES / (1024 * 1024)} Mo).`,
      );
    }
    if (!EventAttachmentsService.ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Type de fichier non autorisé (${file.mimetype}). Formats acceptés : PDF, PNG, JPEG, WebP, GIF.`,
      );
    }

    // Nettoyage du nom affiché : on garde le nom original côté user mais on
    // stocke sous un nom neutre (UUID + extension) pour éviter les problèmes
    // de chemins/accents/espaces sur Windows.
    const ext = extname(file.originalname).toLowerCase().slice(0, 8) || '';
    const id = randomUUID();
    const dir = this.eventDir(eventId);
    const storagePath = join(dir, `${id}${ext}`);

    await mkdir(dir, { recursive: true });
    await writeFile(storagePath, file.buffer);

    const row = await this.prisma.clubEventAttachment.create({
      data: {
        id,
        eventId,
        fileName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
      },
    });
    return row;
  }

  /**
   * Retourne la ligne + stream du fichier, sinon NotFoundException.
   * Le contrôleur pose les en-têtes HTTP appropriés.
   */
  async openForDownload(clubId: string, eventId: string, attachmentId: string) {
    const row = await this.prisma.clubEventAttachment.findFirst({
      where: {
        id: attachmentId,
        eventId,
        event: { clubId },
      },
    });
    if (!row) throw new NotFoundException('Pièce jointe introuvable');
    if (!existsSync(row.storagePath)) {
      // La ligne existe mais le fichier a disparu — on retourne 404 propre
      // plutôt qu'une erreur bas niveau qui ferait crasher la réponse.
      throw new NotFoundException('Fichier absent du disque');
    }
    const stream = createReadStream(row.storagePath);
    return { row, stream };
  }

  /**
   * Supprime le fichier disque + la ligne en base.
   * Idempotent : absence = succès silencieux.
   */
  async remove(clubId: string, eventId: string, attachmentId: string) {
    const row = await this.prisma.clubEventAttachment.findFirst({
      where: {
        id: attachmentId,
        eventId,
        event: { clubId },
      },
    });
    if (!row) return false;
    try {
      await unlink(row.storagePath);
    } catch {
      // Le fichier est déjà parti → on supprime quand même la ligne.
    }
    await this.prisma.clubEventAttachment.delete({ where: { id: row.id } });
    return true;
  }

  async listForEvent(clubId: string, eventId: string) {
    return this.prisma.clubEventAttachment.findMany({
      where: { eventId, event: { clubId } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Petit helper : ETag stable basé sur (id, sizeBytes) — suffisant car un
   * fichier n'est pas réécrit (il faut le supprimer puis réuploader).
   */
  etag(row: { id: string; sizeBytes: number }): string {
    return createHash('sha1').update(`${row.id}|${row.sizeBytes}`).digest('hex');
  }
}
