import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ShopExchangeNotePdfService } from '../pdf/shop-exchange-note-pdf.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { NON_SIGNE } from './shop-exchange-note.service';
import { ShopService } from './shop.service';

/**
 * Bon d'échange PDF d'un échange signé (ADR-0020), par lien signé : l'écran
 * l'ouvre dans un nouvel onglet, qui n'envoie aucun en-tête. Le club vient du
 * lien, et c'est la signature qui le rend digne de foi.
 */
@Controller('shop/exchanges')
export class ShopExchangeNoteController {
  constructor(
    private readonly shop: ShopService,
    private readonly pdf: ShopExchangeNotePdfService,
    private readonly links: ShopDeliveryNoteLinkService,
  ) {}

  @Get(':id/note/signed.pdf')
  async signedExchangeNote(
    @Param('id') id: string,
    @Query('club') club: string | undefined,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!club || !this.links.verifyExchange(club, id, exp, sig)) {
      throw new ForbiddenException(
        'Lien expiré ou invalide : rouvrez le bon d’échange depuis la commande.',
      );
    }
    const data = await this.shop.getExchangeNote(club, id);
    if (!data) throw new NotFoundException(NON_SIGNE);

    const pdf = await this.pdf.build(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Bon_d_echange_${data.exchange.reference}.pdf"`,
    );
    res.setHeader('Content-Length', String(pdf.length));
    // Document signé : ni cache partagé, ni conservation dans le navigateur.
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(pdf);
  }
}
