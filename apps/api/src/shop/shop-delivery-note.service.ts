import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { ShopDeliveryNotePdfService } from '../pdf/shop-delivery-note-pdf.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopService } from './shop.service';

/** Adresse plausible : ce qui sépare une faute de frappe d'un envoi perdu. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NON_REMISE =
  'Bon de livraison introuvable : cette commande n’a pas été remise.';

/**
 * Remettre le bon de livraison à l'adhérent (ADR-0017) : l'ouvrir sur l'écran
 * de l'admin, ou l'envoyer par e-mail à la personne.
 *
 * Service distinct de `ShopService`, qui ne connaît ni la messagerie ni le
 * PDF : le bon est un document produit à partir de la commande, pas un état de
 * la commande.
 */
@Injectable()
export class ShopDeliveryNoteService {
  constructor(
    private readonly shop: ShopService,
    private readonly pdf: ShopDeliveryNotePdfService,
    private readonly mail: TransactionalMailService,
    private readonly links: ShopDeliveryNoteLinkService,
  ) {}

  /**
   * Lien signé et court vers le bon d'une commande REMISE de ce club. Aucun
   * lien n'est émis pour une commande non remise : il mènerait à une erreur.
   */
  async link(clubId: string, orderId: string): Promise<string> {
    const note = await this.shop.getDeliveryNote(clubId, orderId);
    if (!note) throw new NotFoundException(NON_REMISE);
    return this.links.url(clubId, orderId);
  }

  /**
   * Envoie le bon de livraison en pièce jointe. L'adresse est choisie par
   * l'admin — celle de l'acheteur par défaut, ou celle d'un parent — et rendue
   * telle qu'elle a servi, pour que l'écran dise à qui le bon est parti.
   */
  async sendByEmail(
    clubId: string,
    orderId: string,
    email: string,
  ): Promise<string> {
    const to = email.trim();
    if (!EMAIL.test(to)) {
      throw new BadRequestException('Adresse e-mail invalide.');
    }
    const note = await this.shop.getDeliveryNote(clubId, orderId);
    if (!note) throw new NotFoundException(NON_REMISE);

    const pdf = await this.pdf.build(note);
    await this.mail.sendShopDeliveryNote(clubId, to, {
      clubName: note.club.name,
      buyerName: note.buyerName,
      orderReference: note.order.reference,
      deliveredAt: note.delivery.deliveredAt,
      pdf,
    });
    return to;
  }
}
