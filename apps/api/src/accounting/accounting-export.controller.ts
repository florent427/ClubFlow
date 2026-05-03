import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { AccountingExportService } from './accounting-export.service';

/**
 * Endpoint REST pour les exports comptables (CSV + FEC).
 * GraphQL serait inadapté pour streamer un fichier → on passe par REST
 * avec download direct (Content-Disposition).
 */
@Controller('accounting/export')
export class AccountingExportController {
  constructor(
    private readonly exportService: AccountingExportService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveContext(req: Request): Promise<string> {
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId || typeof clubId !== 'string') {
      throw new BadRequestException('X-Club-Id header requis');
    }
    // Vérifie que le module ACCOUNTING est activé pour ce club
    const moduleRow = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.ACCOUNTING },
      },
    });
    if (!moduleRow?.enabled) {
      throw new BadRequestException('Module comptabilité désactivé');
    }
    return clubId;
  }

  private parseRange(query: Record<string, unknown>): {
    from?: Date | null;
    to?: Date | null;
  } {
    const from = query.from
      ? new Date(String(query.from))
      : null;
    const to = query.to ? new Date(String(query.to)) : null;
    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('Paramètre "from" invalide');
    }
    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('Paramètre "to" invalide');
    }
    return { from, to };
  }

  @Get('csv')
  @UseGuards(AuthGuard('jwt'))
  async exportCsv(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, unknown>,
  ): Promise<void> {
    const clubId = await this.resolveContext(req);
    const range = this.parseRange(query);
    const csv = await this.exportService.exportCsv(clubId, range);
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comptabilite-${ts}.csv"`,
    );
    // Ajoute un BOM UTF-8 pour compat Excel Windows
    res.send('\uFEFF' + csv);
  }

  @Get('fec')
  @UseGuards(AuthGuard('jwt'))
  async exportFec(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, unknown>,
  ): Promise<void> {
    const clubId = await this.resolveContext(req);
    const range = this.parseRange(query);
    const fec = await this.exportService.exportFec(clubId, range);
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { siret: true, slug: true },
    });
    const siret = club?.siret ?? club?.slug ?? 'CLUBFLOW';
    // Format nom de fichier FEC : <SIREN>FEC<AAAAMMJJ>.txt
    const year = range.to
      ? range.to.getUTCFullYear()
      : new Date().getUTCFullYear();
    const fname = `${siret.replace(/[^\w]/g, '').slice(0, 14)}FEC${year}1231.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(fec);
  }
}
