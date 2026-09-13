import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ShopDeliveryNotePdfService } from '../pdf/shop-delivery-note-pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ShopDeliveryNoteController } from './shop-delivery-note.controller';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import type { ShopService } from './shop.service';

/**
 * Le bon de livraison porte la signature d'un adhérent. Par en-têtes, seul le
 * back-office du club concerné le lit : le double de Prisma ne connaît qu'une
 * adhésion d'admin, dans `club-1`. Par lien signé, seule une signature valide
 * pour CE club et CETTE commande ouvre la porte — le vrai signataire est
 * utilisé, pas un double.
 */

const PDF = Buffer.from('%PDF-1.3 test');

function makeController(opts: { note?: unknown; adminOfClub1?: boolean }) {
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ systemRole: null })) },
    clubMembership: {
      findUnique: jest.fn(async ({ where }: any) =>
        opts.adminOfClub1 && where.userId_clubId.clubId === 'club-1'
          ? { role: MembershipRole.CLUB_ADMIN }
          : null,
      ),
    },
  };
  const shop = { getDeliveryNote: jest.fn(async () => opts.note ?? null) };
  const pdf = { build: jest.fn(async () => PDF) };
  const links = new ShopDeliveryNoteLinkService();
  const controller = new ShopDeliveryNoteController(
    prisma as unknown as PrismaService,
    shop as unknown as ShopService,
    pdf as unknown as ShopDeliveryNotePdfService,
    links,
  );
  const res = { setHeader: jest.fn(), end: jest.fn() };
  const req = (clubId?: string) =>
    ({
      headers: clubId ? { 'x-club-id': clubId } : {},
      user: { userId: 'u-1' },
    }) as unknown as Request;
  return { controller, shop, pdf, links, res, req };
}

const NOTE = { order: { reference: 'CMD-ABCDEF12' } };

describe('ShopDeliveryNoteController — par en-têtes', () => {
  it('refuse sans en-tête de club', async () => {
    const h = makeController({ adminOfClub1: true, note: NOTE });

    await expect(
      h.controller.deliveryNote(h.req(), 'order-1', h.res as unknown as Response),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse un admin d’un AUTRE club, sans même lire la commande', async () => {
    const h = makeController({ adminOfClub1: true, note: NOTE });

    await expect(
      h.controller.deliveryNote(h.req('club-2'), 'order-1', h.res as unknown as Response),
    ).rejects.toThrow(ForbiddenException);

    expect(h.shop.getDeliveryNote).not.toHaveBeenCalled();
    expect(h.res.end).not.toHaveBeenCalled();
  });

  it('refuse un utilisateur sans rôle de back-office', async () => {
    const h = makeController({ adminOfClub1: false, note: NOTE });

    await expect(
      h.controller.deliveryNote(h.req('club-1'), 'order-1', h.res as unknown as Response),
    ).rejects.toThrow(ForbiddenException);

    expect(h.shop.getDeliveryNote).not.toHaveBeenCalled();
  });

  it('404 quand la commande n’a pas été remise', async () => {
    const h = makeController({ adminOfClub1: true, note: null });

    await expect(
      h.controller.deliveryNote(h.req('club-1'), 'order-1', h.res as unknown as Response),
    ).rejects.toThrow(NotFoundException);

    expect(h.pdf.build).not.toHaveBeenCalled();
  });

  it('sert le PDF au back-office du club, sans cache', async () => {
    const h = makeController({ adminOfClub1: true, note: NOTE });

    await h.controller.deliveryNote(
      h.req('club-1'),
      'order-1',
      h.res as unknown as Response,
    );

    expect(h.shop.getDeliveryNote).toHaveBeenCalledWith('club-1', 'order-1');
    expect(h.res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(h.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(h.res.end).toHaveBeenCalledWith(PDF);
  });
});

describe('ShopDeliveryNoteController — par lien signé', () => {
  it('un lien valide sert le bon, sans jeton ni en-tête', async () => {
    const h = makeController({ note: NOTE });
    const { exp, sig } = h.links.sign('club-1', 'order-1');

    await h.controller.signedDeliveryNote(
      'order-1',
      'club-1',
      String(exp),
      sig,
      h.res as unknown as Response,
    );

    expect(h.shop.getDeliveryNote).toHaveBeenCalledWith('club-1', 'order-1');
    expect(h.res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="Bon_de_livraison_CMD-ABCDEF12.pdf"',
    );
    expect(h.res.end).toHaveBeenCalledWith(PDF);
  });

  it('le lien d’un club présenté pour un autre : refusé, sans lire la commande', async () => {
    const h = makeController({ note: NOTE });
    const { exp, sig } = h.links.sign('club-1', 'order-1');

    await expect(
      h.controller.signedDeliveryNote(
        'order-1',
        'club-2',
        String(exp),
        sig,
        h.res as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(h.shop.getDeliveryNote).not.toHaveBeenCalled();
    expect(h.res.end).not.toHaveBeenCalled();
  });

  it('un lien expiré : refusé', async () => {
    const h = makeController({ note: NOTE });
    const { exp, sig } = h.links.sign(
      'club-1',
      'order-1',
      Date.now() - (ShopDeliveryNoteLinkService.TTL_SECONDS + 60) * 1000,
    );

    await expect(
      h.controller.signedDeliveryNote(
        'order-1',
        'club-1',
        String(exp),
        sig,
        h.res as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(h.shop.getDeliveryNote).not.toHaveBeenCalled();
  });

  it('un lien sans club : refusé', async () => {
    const h = makeController({ note: NOTE });
    const { exp, sig } = h.links.sign('club-1', 'order-1');

    await expect(
      h.controller.signedDeliveryNote(
        'order-1',
        undefined,
        String(exp),
        sig,
        h.res as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un lien valide vers une commande non remise : 404', async () => {
    const h = makeController({ note: null });
    const { exp, sig } = h.links.sign('club-1', 'order-1');

    await expect(
      h.controller.signedDeliveryNote(
        'order-1',
        'club-1',
        String(exp),
        sig,
        h.res as unknown as Response,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(h.pdf.build).not.toHaveBeenCalled();
  });
});
