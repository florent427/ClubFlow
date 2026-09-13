import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TransactionalMailService } from '../mail/transactional-mail.service';
import type {
  ShopDeliveryNoteData,
  ShopDeliveryNotePdfService,
} from '../pdf/shop-delivery-note-pdf.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopDeliveryNoteService } from './shop-delivery-note.service';
import type { ShopService } from './shop.service';

/**
 * Ouvrir ou envoyer le bon de livraison. Le double de `ShopService` ne connaît
 * qu'une commande remise : `order-1`, dans `club-1`. Tout le reste — autre
 * club, commande non remise — doit se traduire par un refus, sans lien émis ni
 * e-mail envoyé.
 */

const PDF = Buffer.from('%PDF-bon');

const NOTE: ShopDeliveryNoteData = {
  club: { name: 'Dojo Test', siret: null, address: null },
  order: {
    reference: 'CMD-ORDER-1',
    createdAt: new Date('2026-09-13T08:00:00Z'),
    totalCents: 2500,
    paid: true,
    paidAt: new Date('2026-09-13T08:30:00Z'),
    lines: [],
  },
  buyerName: 'Camillah ABDILLAH',
  delivery: {
    deliveredAt: new Date('2026-09-13T15:00:00Z'),
    signerName: 'Maman de Camillah',
    signaturePng: Buffer.from('png'),
  },
  terms: null,
};

function make(note: ShopDeliveryNoteData | null) {
  const shop = {
    getDeliveryNote: jest.fn(async (clubId: string, orderId: string) =>
      clubId === 'club-1' && orderId === 'order-1' ? note : null,
    ),
  };
  const pdf = { build: jest.fn(async () => PDF) };
  const mail = { sendShopDeliveryNote: jest.fn(async () => undefined) };
  const links = new ShopDeliveryNoteLinkService();
  const svc = new ShopDeliveryNoteService(
    shop as unknown as ShopService,
    pdf as unknown as ShopDeliveryNotePdfService,
    mail as unknown as TransactionalMailService,
    links,
  );
  return { svc, shop, pdf, mail, links };
}

describe('ShopDeliveryNoteService.link', () => {
  it('émet un lien lié au club et à la commande, qui se vérifie', async () => {
    const h = make(NOTE);

    const url = new URL(await h.svc.link('club-1', 'order-1'));

    expect(url.searchParams.get('club')).toBe('club-1');
    expect(
      h.links.verify(
        url.searchParams.get('club') ?? undefined,
        'order-1',
        url.searchParams.get('exp') ?? undefined,
        url.searchParams.get('sig') ?? undefined,
      ),
    ).toBe(true);
  });

  it('aucun lien pour une commande non remise', async () => {
    const h = make(null);

    await expect(h.svc.link('club-1', 'order-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aucun lien pour la commande d’un autre club', async () => {
    const h = make(NOTE);

    await expect(h.svc.link('club-2', 'order-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ShopDeliveryNoteService.sendByEmail', () => {
  it('envoie LE bon produit pour cette commande, à l’adresse nettoyée, et la rend', async () => {
    const h = make(NOTE);

    await expect(
      h.svc.sendByEmail('club-1', 'order-1', '  maman@example.fr '),
    ).resolves.toBe('maman@example.fr');

    expect(h.pdf.build).toHaveBeenCalledWith(NOTE);
    expect(h.mail.sendShopDeliveryNote).toHaveBeenCalledWith(
      'club-1',
      'maman@example.fr',
      {
        clubName: 'Dojo Test',
        buyerName: 'Camillah ABDILLAH',
        orderReference: 'CMD-ORDER-1',
        deliveredAt: NOTE.delivery.deliveredAt,
        pdf: PDF,
      },
    );
  });

  it.each(['', 'maman', 'maman@', 'maman@example', 'ma man@example.fr'])(
    'refuse « %s » sans rien lire, produire ni envoyer',
    async (adresse) => {
      const h = make(NOTE);

      await expect(
        h.svc.sendByEmail('club-1', 'order-1', adresse),
      ).rejects.toThrow(BadRequestException);

      expect(h.shop.getDeliveryNote).not.toHaveBeenCalled();
      expect(h.pdf.build).not.toHaveBeenCalled();
      expect(h.mail.sendShopDeliveryNote).not.toHaveBeenCalled();
    },
  );

  it('refuse une commande non remise, sans rien envoyer', async () => {
    const h = make(null);

    await expect(
      h.svc.sendByEmail('club-1', 'order-1', 'maman@example.fr'),
    ).rejects.toThrow(NotFoundException);

    expect(h.mail.sendShopDeliveryNote).not.toHaveBeenCalled();
  });

  it('refuse la commande d’un autre club, sans rien envoyer', async () => {
    const h = make(NOTE);

    await expect(
      h.svc.sendByEmail('club-2', 'order-1', 'maman@example.fr'),
    ).rejects.toThrow(NotFoundException);

    expect(h.mail.sendShopDeliveryNote).not.toHaveBeenCalled();
  });
});
