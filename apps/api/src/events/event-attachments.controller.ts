import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { PrismaService } from '../prisma/prisma.service';
import { EventAttachmentsService } from './event-attachments.service';

/**
 * Endpoints REST pour les pièces jointes d'événements.
 *
 * Pourquoi REST et pas GraphQL ?
 * - GraphQL gère mal les fichiers binaires (il faut un middleware upload
 *   type `graphql-upload` qui rajoute une surface d'attaque).
 * - Le téléchargement nécessite de streamer avec les bons en-têtes
 *   (Content-Type, Content-Disposition), plus simple en Express pur.
 *
 * Auth :
 * - JWT Bearer (Passport strategy `jwt`)
 * - Contexte club extrait du header `X-Club-Id` (cohérent avec
 *   `InvoicePdfController`). Le guard de club est implicite car on
 *   filtre systématiquement par `clubId` en base.
 */
@Controller('events/:eventId/attachments')
@UseGuards(AuthGuard('jwt'))
export class EventAttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: EventAttachmentsService,
  ) {}

  private extractClubId(req: Request): string {
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId || typeof clubId !== 'string') {
      throw new BadRequestException('X-Club-Id header requis');
    }
    return clubId;
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: EventAttachmentsService.MAX_BYTES, files: 1 },
    }),
  )
  async upload(
    @Req() req: Request,
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const clubId = this.extractClubId(req);
    if (!file) {
      throw new BadRequestException(
        'Aucun fichier reçu — utilisez le champ multipart `file`.',
      );
    }
    const row = await this.service.upload(clubId, eventId, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });
    return {
      id: row.id,
      eventId: row.eventId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Get()
  async list(@Req() req: Request, @Param('eventId') eventId: string) {
    const clubId = this.extractClubId(req);
    const rows = await this.service.listForEvent(clubId, eventId);
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  @Get(':attachmentId')
  async download(
    @Req() req: Request,
    @Param('eventId') eventId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const clubId = this.extractClubId(req);
    const { row, stream } = await this.service.openForDownload(
      clubId,
      eventId,
      attachmentId,
    );
    res.setHeader('Content-Type', row.mimeType);
    // On préfère `inline` pour que les PDF/images s'ouvrent dans le navigateur ;
    // l'UI peut ajouter `download="..."` sur son <a> si elle veut forcer la
    // sauvegarde. RFC 5987 pour le nom encodé (accents, espaces).
    const encoded = encodeURIComponent(row.fileName);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${row.fileName.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', String(row.sizeBytes));
    res.setHeader('ETag', `"${this.service.etag(row)}"`);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }

  @Delete(':attachmentId')
  async delete(
    @Req() req: Request,
    @Param('eventId') eventId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<{ deleted: boolean }> {
    const clubId = this.extractClubId(req);
    const deleted = await this.service.remove(clubId, eventId, attachmentId);
    return { deleted };
  }
}
