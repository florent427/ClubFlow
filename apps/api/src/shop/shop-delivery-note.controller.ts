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
import { ShopDeliveryNotePdfService } from '../pdf/shop-delivery-note-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from './shop.service';

/**
 * Bon de livraison PDF d'une commande remise (ADR-0017).
 *
 * REST et non GraphQL, comme les factures : le navigateur télécharge un
 * fichier. Réservé au BACK-OFFICE du club — le bon porte la signature de
 * l'adhérent, et un `X-Club-Id` envoyé par l'appelant ne prouve rien à lui
 * seul : le rôle est vérifié pour ce club précis.
 */
@Controller('shop/orders')
@UseGuards(AuthGuard('jwt'))
export class ShopDeliveryNoteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
    private readonly pdf: ShopDeliveryNotePdfService,
  ) {}

  @Get(':id/delivery-note.pdf')
  async deliveryNote(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId) {
      throw new BadRequestException('X-Club-Id header requis');
    }
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    if (
      !userId ||
      !(await userHasClubBackOfficeRole(this.prisma, userId, clubId))
    ) {
      throw new ForbiddenException();
    }

    const data = await this.shop.getDeliveryNote(clubId, id);
    if (!data) {
      throw new NotFoundException(
        'Bon de livraison introuvable : cette commande n’a pas été remise.',
      );
    }
    const pdf = await this.pdf.build(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Bon_de_livraison_${data.order.reference}.pdf"`,
    );
    res.setHeader('Content-Length', String(pdf.length));
    // Document signé : ni cache partagé, ni conservation dans le navigateur.
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(pdf);
  }
}
