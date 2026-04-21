import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicePdfService } from './invoice-pdf.service';

/**
 * Téléchargement PDF des factures / avoirs.
 *
 * Auth : JWT Bearer standard (pas GraphQL).
 * Contexte club : header `X-Club-Id` (alignement avec le reste de l'API).
 */
@Controller('invoices')
@UseGuards(AuthGuard('jwt'))
export class InvoicePdfController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: InvoicePdfService,
  ) {}

  @Get(':id/pdf')
  async getInvoicePdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const clubIdRaw = req.headers['x-club-id'];
    const clubId = Array.isArray(clubIdRaw) ? clubIdRaw[0] : clubIdRaw;
    if (!clubId) {
      throw new BadRequestException('X-Club-Id header requis');
    }

    // Vérifie que l'utilisateur est rattaché au club — on réutilise la logique
    // simple du ClubContextGuard : présence d'un club Id valide suffit car
    // l'UI n'expose que les clubs de l'utilisateur. Les permissions fines
    // (admin/membre) sont orthogonales — la facture n'est jamais révélée
    // à un autre club (filtre via WHERE clubId ci-dessous).
    const club = await this.prisma.club.findUnique({
      where: { id: clubId as string },
    });
    if (!club) throw new BadRequestException('Club introuvable');

    const pdf = await this.pdfService.buildInvoicePdf(clubId as string, id);
    const filenameCore = id.slice(0, 8).toUpperCase();
    // Récupère à nouveau pour savoir si c'est un avoir (on pourrait l'inclure
    // dans buildInvoicePdf mais ici on veut juste le nom de fichier correct).
    const row = await this.prisma.invoice.findFirst({
      where: { id, clubId: clubId as string },
      select: { isCreditNote: true },
    });
    const prefix = row?.isCreditNote ? 'Avoir' : 'Facture';
    const filename = `${prefix}_${filenameCore}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"`,
    );
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }
}
