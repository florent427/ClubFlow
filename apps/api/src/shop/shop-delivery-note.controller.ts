import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { userHasClubBackOfficeRole } from '../common/club-back-office-role';
import {
  ShopDeliveryNotePdfService,
  type ShopDeliveryNoteData,
} from '../pdf/shop-delivery-note-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopService } from './shop.service';

const NON_REMISE =
  'Bon de livraison introuvable : cette commande n’a pas été remise.';

/**
 * Bon de livraison PDF d'une commande remise (ADR-0017).
 *
 * REST et non GraphQL, comme les factures : le navigateur affiche un fichier.
 * Deux portes, un seul document :
 *  - par EN-TÊTES (JWT + `X-Club-Id`), réservée au back-office du club — un
 *    `X-Club-Id` envoyé par l'appelant ne prouve rien à lui seul, le rôle est
 *    vérifié pour ce club précis ;
 *  - par LIEN SIGNÉ, que l'écran ouvre dans un nouvel onglet. Le lien est émis
 *    par une mutation réservée au back-office et porte le club et la commande
 *    dans sa signature.
 */
@Controller('shop/orders')
export class ShopDeliveryNoteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
    private readonly pdf: ShopDeliveryNotePdfService,
    private readonly links: ShopDeliveryNoteLinkService,
  ) {}

  @Get(':id/delivery-note.pdf')
  @UseGuards(AuthGuard('jwt'))
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
    if (!data) throw new NotFoundException(NON_REMISE);
    await this.send(res, data);
  }

  /**
   * Même bon, par lien signé : un onglet n'envoie aucun en-tête. Le club vient
   * du lien, et c'est la signature qui le rend digne de foi — un club modifié à
   * la main l'invalide avant toute lecture.
   */
  @Get(':id/delivery-note/signed.pdf')
  async signedDeliveryNote(
    @Param('id') id: string,
    @Query('club') club: string | undefined,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!club || !this.links.verify(club, id, exp, sig)) {
      throw new ForbiddenException(
        'Lien expiré ou invalide : rouvrez le bon de livraison depuis la commande.',
      );
    }
    const data = await this.shop.getDeliveryNote(club, id);
    if (!data) throw new NotFoundException(NON_REMISE);
    await this.send(res, data);
  }

  private async send(res: Response, data: ShopDeliveryNoteData): Promise<void> {
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
