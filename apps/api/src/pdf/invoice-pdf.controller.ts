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
import { ClubRestAccessGuard } from '../common/guards/club-rest-access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicePdfService } from './invoice-pdf.service';

/**
 * Téléchargement PDF des factures / avoirs.
 *
 * Auth : JWT Bearer standard (pas GraphQL), puis `ClubRestAccessGuard` : le
 * compte doit appartenir au back-office du club de l'en-tête `X-Club-Id`, comme
 * pour la facturation en GraphQL.
 */
@Controller('invoices')
@UseGuards(AuthGuard('jwt'), ClubRestAccessGuard)
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

    // L'appartenance au club est vérifiée par `ClubRestAccessGuard`. L'en-tête
    // seul ne prouve rien : il se falsifie, et l'identifiant d'un club est
    // public. Tant que la route s'en contentait, un compte de n'importe quel
    // club lisait les factures d'un autre.
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
      select: { isCreditNote: true, purpose: true },
    });
    const prefix = row?.isCreditNote
      ? 'Avoir'
      : row?.purpose === 'PAYER_CREDIT_DEPOSIT'
        ? 'Recu_avance'
        : 'Facture';
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
