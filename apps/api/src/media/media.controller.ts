import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { MediaAssetsService } from './media-assets.service';

/**
 * Endpoints REST pour le service média générique.
 *
 *  - POST   /media/upload       (auth admin) upload image ou document
 *  - GET    /media/:id          (public)     servir le fichier avec cache long
 *  - DELETE /media/:id          (auth admin) supprimer
 *  - GET    /media              (auth admin) lister les médias du club
 *
 * Le GET est public pour permettre aux `<img src>` du site vitrine de charger
 * directement sans JWT. L'URL est non-devinable (UUID) et le nom de fichier
 * n'apparaît pas dans l'URL ; un attaquant doit donc connaître l'ID.
 */
@Controller('media')
export class MediaController {
  constructor(private readonly service: MediaAssetsService) {}

  private extractClubId(req: Request): string {
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId || typeof clubId !== 'string') {
      throw new BadRequestException('X-Club-Id header requis');
    }
    return clubId;
  }

  @Post('upload')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MediaAssetsService.MAX_BYTES, files: 1 },
    }),
  )
  async upload(
    @Req() req: Request,
    @Query('kind') kind: 'image' | 'document' | undefined,
    @Query('ownerKind') ownerKind: string | undefined,
    @Query('ownerId') ownerId: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const clubId = this.extractClubId(req);
    if (!file) {
      throw new BadRequestException(
        'Aucun fichier reçu — utilisez le champ multipart `file`.',
      );
    }
    const owner =
      ownerKind && ownerId ? { kind: ownerKind, id: ownerId } : null;
    const userId = (req.user as { userId?: string } | undefined)?.userId ?? null;
    const row =
      kind === 'document'
        ? await this.service.uploadDocument(clubId, userId, file, owner)
        : await this.service.uploadImage(clubId, userId, file, owner);
    return {
      id: row.id,
      clubId: row.clubId,
      kind: row.kind,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      publicUrl: row.publicUrl,
      ownerKind: row.ownerKind,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async list(
    @Req() req: Request,
    @Query('kind') kind?: 'IMAGE' | 'DOCUMENT' | 'OTHER',
    @Query('ownerKind') ownerKind?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    const clubId = this.extractClubId(req);
    const rows = await this.service.listByClub(clubId, {
      kind,
      ownerKind,
      ownerId,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      publicUrl: r.publicUrl,
      ownerKind: r.ownerKind,
      ownerId: r.ownerId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Sert le fichier physique. Public (pas de JWT) : les URLs sont UUID-based
   * non-devinables. Rate-limit raisonnable pour empêcher un scan massif.
   */
  @Get(':id')
  @Throttle({ default: { limit: 1000, ttl: 60_000 } })
  async download(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { row, stream } = await this.service.streamFor(id);
    res.setHeader('Content-Type', row.mimeType);
    const encoded = encodeURIComponent(row.fileName);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${row.fileName.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', String(row.sizeBytes));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${this.service.etag(row)}"`);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async delete(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ deleted: boolean }> {
    const clubId = this.extractClubId(req);
    const deleted = await this.service.delete(clubId, id);
    return { deleted };
  }
}
