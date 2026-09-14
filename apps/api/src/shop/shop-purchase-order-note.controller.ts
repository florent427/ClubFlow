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
  ShopPurchaseOrderPdfService,
  type ShopPurchaseOrderPdfData,
} from '../pdf/shop-purchase-order-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopPurchaseOrderNoteService } from './shop-purchase-order-note.service';

const INTROUVABLE = 'Commande fournisseur introuvable.';

/**
 * Bon de commande fournisseur en PDF (ADR-0021 §5).
 *
 * Les deux portes du bon de livraison (ADR-0017), pour un document qui porte
 * les prix d'achat du club :
 *  - par EN-TÊTES (JWT + `X-Club-Id`), réservée au back-office du club — le
 *    rôle est vérifié pour ce club précis ;
 *  - par LIEN SIGNÉ, que l'écran ouvre dans un nouvel onglet. Le lien est émis
 *    par une mutation réservée au back-office et porte le club et la commande
 *    dans sa signature.
 */
@Controller('shop/purchase-orders')
export class ShopPurchaseOrderNoteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: ShopPurchaseOrderNoteService,
    private readonly pdf: ShopPurchaseOrderPdfService,
    private readonly links: ShopDeliveryNoteLinkService,
  ) {}

  @Get(':id/purchase-order.pdf')
  @UseGuards(AuthGuard('jwt'))
  async purchaseOrder(
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

    const data = await this.notes.document(clubId, id);
    if (!data) throw new NotFoundException(INTROUVABLE);
    await this.send(res, data);
  }

  /**
   * Même bon, par lien signé : un onglet n'envoie aucun en-tête. Le club vient
   * du lien, et c'est la signature qui le rend digne de foi.
   */
  @Get(':id/purchase-order/signed.pdf')
  async signedPurchaseOrder(
    @Param('id') id: string,
    @Query('club') club: string | undefined,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!club || !this.links.verifyPurchaseOrder(club, id, exp, sig)) {
      throw new ForbiddenException(
        'Lien expiré ou invalide : rouvrez le bon de commande depuis la commande.',
      );
    }
    const data = await this.notes.document(club, id);
    if (!data) throw new NotFoundException(INTROUVABLE);
    await this.send(res, data);
  }

  private async send(res: Response, data: ShopPurchaseOrderPdfData): Promise<void> {
    const pdf = await this.pdf.build(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Bon_de_commande_${data.order.reference}.pdf"`,
    );
    res.setHeader('Content-Length', String(pdf.length));
    // Prix d'achat du club : ni cache partagé, ni conservation dans le navigateur.
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(pdf);
  }
}
