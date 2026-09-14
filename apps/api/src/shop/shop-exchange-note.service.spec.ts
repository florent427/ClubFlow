import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TransactionalMailService } from '../mail/transactional-mail.service';
import type {
  ShopExchangeNoteData,
  ShopExchangeNotePdfService,
} from '../pdf/shop-exchange-note-pdf.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { NON_SIGNE, ShopExchangeNoteService } from './shop-exchange-note.service';
import type { ShopService } from './shop.service';

/**
 * Ouvrir ou envoyer le bon d'échange (ADR-0020). Le double de `ShopService` ne
 * connaît qu'un échange signé : `adj-1`, dans `club-1`. Tout le reste — autre
 * club, échange non signé — doit se traduire par un refus, sans lien émis ni
 * e-mail envoyé.
 */

const PDF = Buffer.from('%PDF-echange');

const NOTE: ShopExchangeNoteData = {
  club: { name: 'Dojo Test', siret: null, address: null },
  order: { reference: 'CMD-ORDER-1', createdAt: new Date('2026-09-13T08:00:00Z') },
  exchange: {
    reference: 'ECH-ADJ-1',
    at: new Date('2026-09-14T15:00:00Z'),
    reason: 'Taille trop petite',
    returned: { quantity: 1, label: 'Kimono — 120/130', unitPriceCents: 2500 },
    taken: { quantity: 1, label: 'Kimono — 140/150', unitPriceCents: 2500 },
    differenceCents: 0,
    refundedCents: 0,
    writtenOffCents: 0,
  },
  buyerName: 'Camillah ABDILLAH',
  signature: { signerName: 'Maman de Camillah', signaturePng: Buffer.from('png') },
};

function make(note: ShopExchangeNoteData | null) {
  const shop = {
    getExchangeNote: jest.fn(async (clubId: string, adjustmentId: string) =>
      clubId === 'club-1' && adjustmentId === 'adj-1' ? note : null,
    ),
  };
  const pdf = { build: jest.fn(async () => PDF) };
  const mail = { sendShopExchangeNote: jest.fn(async () => undefined) };
  const links = new ShopDeliveryNoteLinkService();
  const svc = new ShopExchangeNoteService(
    shop as unknown as ShopService,
    pdf as unknown as ShopExchangeNotePdfService,
    mail as unknown as TransactionalMailService,
    links,
  );
  return { svc, shop, pdf, mail, links };
}

describe('ShopExchangeNoteService.link', () => {
  it('émet un lien de bon d’échange lié au club et à l’échange, qui se vérifie', async () => {
    const h = make(NOTE);

    const url = new URL(await h.svc.link('club-1', 'adj-1'));
    const club = url.searchParams.get('club') ?? undefined;
    const exp = url.searchParams.get('exp') ?? undefined;
    const sig = url.searchParams.get('sig') ?? undefined;

    expect(url.pathname).toBe('/shop/exchanges/adj-1/note/signed.pdf');
    expect(club).toBe('club-1');
    expect(h.links.verifyExchange(club, 'adj-1', exp, sig)).toBe(true);
    // Il n'ouvre pas un bon de livraison.
    expect(h.links.verify(club, 'adj-1', exp, sig)).toBe(false);
  });

  it('aucun lien pour un échange non signé', async () => {
    const h = make(null);

    await expect(h.svc.link('club-1', 'adj-1')).rejects.toThrow(
      new NotFoundException(NON_SIGNE),
    );
  });

  it('aucun lien pour l’échange d’un autre club', async () => {
    const h = make(NOTE);

    await expect(h.svc.link('club-2', 'adj-1')).rejects.toThrow(NotFoundException);
  });
});

describe('ShopExchangeNoteService.sendByEmail', () => {
  it('envoie LE bon produit pour cet échange, à l’adresse nettoyée, et la rend', async () => {
    const h = make(NOTE);

    await expect(
      h.svc.sendByEmail('club-1', 'adj-1', '  maman@example.fr '),
    ).resolves.toBe('maman@example.fr');

    expect(h.pdf.build).toHaveBeenCalledWith(NOTE);
    expect(h.mail.sendShopExchangeNote).toHaveBeenCalledWith(
      'club-1',
      'maman@example.fr',
      {
        clubName: 'Dojo Test',
        buyerName: 'Camillah ABDILLAH',
        exchangeReference: 'ECH-ADJ-1',
        orderReference: 'CMD-ORDER-1',
        exchangedAt: NOTE.exchange.at,
        pdf: PDF,
      },
    );
  });

  it.each(['', 'maman', 'maman@', 'maman@example', 'ma man@example.fr'])(
    'refuse « %s » sans rien lire, produire ni envoyer',
    async (adresse) => {
      const h = make(NOTE);

      await expect(
        h.svc.sendByEmail('club-1', 'adj-1', adresse),
      ).rejects.toThrow(BadRequestException);

      expect(h.shop.getExchangeNote).not.toHaveBeenCalled();
      expect(h.pdf.build).not.toHaveBeenCalled();
      expect(h.mail.sendShopExchangeNote).not.toHaveBeenCalled();
    },
  );

  it('refuse un échange non signé, sans rien envoyer', async () => {
    const h = make(null);

    await expect(
      h.svc.sendByEmail('club-1', 'adj-1', 'maman@example.fr'),
    ).rejects.toThrow(NotFoundException);

    expect(h.mail.sendShopExchangeNote).not.toHaveBeenCalled();
  });

  it('refuse l’échange d’un autre club, sans rien envoyer', async () => {
    const h = make(NOTE);

    await expect(
      h.svc.sendByEmail('club-2', 'adj-1', 'maman@example.fr'),
    ).rejects.toThrow(NotFoundException);

    expect(h.mail.sendShopExchangeNote).not.toHaveBeenCalled();
  });
});
