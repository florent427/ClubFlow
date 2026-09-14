import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { ShopExchangeNotePdfService } from '../pdf/shop-exchange-note-pdf.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopService } from './shop.service';

/** Adresse plausible : ce qui sépare une faute de frappe d'un envoi perdu. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NON_SIGNE =
  'Bon d’échange introuvable : cet échange n’a pas été signé.';

/**
 * Remettre le bon d'échange à l'adhérent (ADR-0020) : l'ouvrir sur l'écran de
 * l'admin, ou l'envoyer par e-mail. Même principe que le bon de livraison : un
 * document produit à partir de l'échange figé, pas un état de la commande.
 */
@Injectable()
export class ShopExchangeNoteService {
  constructor(
    private readonly shop: ShopService,
    private readonly pdf: ShopExchangeNotePdfService,
    private readonly mail: TransactionalMailService,
    private readonly links: ShopDeliveryNoteLinkService,
  ) {}

  /** Lien signé et court vers le bon d'un échange SIGNÉ de ce club. */
  async link(clubId: string, adjustmentId: string): Promise<string> {
    const note = await this.shop.getExchangeNote(clubId, adjustmentId);
    if (!note) throw new NotFoundException(NON_SIGNE);
    return this.links.exchangeUrl(clubId, adjustmentId);
  }

  /** Envoie le bon d'échange en pièce jointe ; rend l'adresse utilisée. */
  async sendByEmail(
    clubId: string,
    adjustmentId: string,
    email: string,
  ): Promise<string> {
    const to = email.trim();
    if (!EMAIL.test(to)) {
      throw new BadRequestException('Adresse e-mail invalide.');
    }
    const note = await this.shop.getExchangeNote(clubId, adjustmentId);
    if (!note) throw new NotFoundException(NON_SIGNE);

    const pdf = await this.pdf.build(note);
    await this.mail.sendShopExchangeNote(clubId, to, {
      clubName: note.club.name,
      buyerName: note.buyerName,
      exchangeReference: note.exchange.reference,
      orderReference: note.order.reference,
      exchangedAt: note.exchange.at,
      pdf,
    });
    return to;
  }
}
