import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { ShopExchangeNotePdfService } from '../pdf/shop-exchange-note-pdf.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopExchangeNoteController } from './shop-exchange-note.controller';
import type { ShopService } from './shop.service';

/**
 * Le bon d'échange porte la signature d'un adhérent (ADR-0020). Il ne s'ouvre
 * que par lien signé : seule une signature valide pour CE club et CET échange
 * ouvre la porte — le vrai signataire est utilisé, pas un double.
 */

const PDF = Buffer.from('%PDF-1.3 echange');
const NOTE = { exchange: { reference: 'ECH-ABCDEF12' } };

function makeController(note: unknown) {
  const shop = { getExchangeNote: jest.fn(async () => note) };
  const pdf = { build: jest.fn(async () => PDF) };
  const links = new ShopDeliveryNoteLinkService();
  const controller = new ShopExchangeNoteController(
    shop as unknown as ShopService,
    pdf as unknown as ShopExchangeNotePdfService,
    links,
  );
  const res = { setHeader: jest.fn(), end: jest.fn() };
  const open = (club: string | undefined, exp: string | undefined, sig: string | undefined) =>
    controller.signedExchangeNote('adj-1', club, exp, sig, res as unknown as Response);
  return { controller, shop, pdf, links, res, open };
}

describe('ShopExchangeNoteController — par lien signé', () => {
  it('un lien valide sert le bon, inline et sans cache', async () => {
    const h = makeController(NOTE);
    const { exp, sig } = h.links.signExchange('club-1', 'adj-1');

    await h.open('club-1', String(exp), sig);

    expect(h.shop.getExchangeNote).toHaveBeenCalledWith('club-1', 'adj-1');
    expect(h.res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(h.res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="Bon_d_echange_ECH-ABCDEF12.pdf"',
    );
    expect(h.res.setHeader).toHaveBeenCalledWith('Content-Length', String(PDF.length));
    expect(h.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(h.res.end).toHaveBeenCalledWith(PDF);
  });

  it('le lien d’un club présenté pour un autre : refusé, sans lire l’échange', async () => {
    const h = makeController(NOTE);
    const { exp, sig } = h.links.signExchange('club-1', 'adj-1');

    await expect(h.open('club-2', String(exp), sig)).rejects.toThrow(ForbiddenException);

    expect(h.shop.getExchangeNote).not.toHaveBeenCalled();
    expect(h.res.end).not.toHaveBeenCalled();
  });

  it('un lien de bon de livraison ne l’ouvre pas', async () => {
    const h = makeController(NOTE);
    const { exp, sig } = h.links.sign('club-1', 'adj-1');

    await expect(h.open('club-1', String(exp), sig)).rejects.toThrow(ForbiddenException);

    expect(h.shop.getExchangeNote).not.toHaveBeenCalled();
  });

  it('un lien expiré : refusé', async () => {
    const h = makeController(NOTE);
    const { exp, sig } = h.links.signExchange(
      'club-1',
      'adj-1',
      Date.now() - (ShopDeliveryNoteLinkService.TTL_SECONDS + 60) * 1000,
    );

    await expect(h.open('club-1', String(exp), sig)).rejects.toThrow(ForbiddenException);

    expect(h.shop.getExchangeNote).not.toHaveBeenCalled();
  });

  it('un lien sans club : refusé', async () => {
    const h = makeController(NOTE);
    const { exp, sig } = h.links.signExchange('club-1', 'adj-1');

    await expect(h.open(undefined, String(exp), sig)).rejects.toThrow(ForbiddenException);
  });

  it('un lien valide vers un échange non signé : 404', async () => {
    const h = makeController(null);
    const { exp, sig } = h.links.signExchange('club-1', 'adj-1');

    await expect(h.open('club-1', String(exp), sig)).rejects.toThrow(NotFoundException);

    expect(h.pdf.build).not.toHaveBeenCalled();
  });
});
