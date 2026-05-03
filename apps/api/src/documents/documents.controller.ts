import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { userHasClubBackOfficeRole } from '../common/club-back-office-role';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { MediaAssetsService } from '../media/media-assets.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endpoints REST du module Documents (download du PDF signé).
 *
 * Pourquoi REST et pas GraphQL ? GraphQL gère mal les fichiers binaires —
 * on streame ici directement le PDF avec les bons headers (Content-Type,
 * Content-Disposition, Content-Length, ETag) en passant par MediaAssetsService.
 *
 * Auth : JWT Bearer. La logique d'accès vérifie soit que l'utilisateur est
 * le signataire (`userId` du SignedDocument), soit qu'il a un rôle
 * back-office sur le club (admin / bureau / trésorier).
 *
 * L'upload du PDF source passe par le `MediaController` existant
 * (POST /media/upload?kind=document) — pas de nouvel endpoint nécessaire.
 */
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  private extractClubId(req: Request): string {
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId || typeof clubId !== 'string') {
      throw new BadRequestException('X-Club-Id header requis');
    }
    return clubId;
  }

  @Get('signed/:signedId/download')
  @UseGuards(AuthGuard('jwt'))
  async downloadSignedDocument(
    @Req() req: Request,
    @Param('signedId') signedId: string,
    @Res() res: Response,
  ): Promise<void> {
    const clubId = this.extractClubId(req);
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    if (!userId) {
      throw new ForbiddenException();
    }

    // Le module DOCUMENTS doit être actif pour ce club.
    const moduleRow = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.DOCUMENTS },
      },
    });
    if (!moduleRow?.enabled) {
      throw new ForbiddenException('Module documents désactivé');
    }

    const signed = await this.prisma.clubSignedDocument.findFirst({
      where: { id: signedId, clubId },
      select: { id: true, userId: true, signedAssetId: true },
    });
    if (!signed) {
      throw new NotFoundException('Signature introuvable');
    }

    // Accès autorisé si signataire OU back-office.
    let canAccess = signed.userId === userId;
    if (!canAccess) {
      canAccess = await userHasClubBackOfficeRole(this.prisma, userId, clubId);
    }
    if (!canAccess) {
      throw new ForbiddenException();
    }

    const { row, stream } = await this.mediaAssets.streamFor(
      signed.signedAssetId,
    );
    res.setHeader('Content-Type', row.mimeType);
    const encoded = encodeURIComponent(row.fileName);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${row.fileName.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', String(row.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('ETag', `"${this.mediaAssets.etag(row)}"`);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }
}
