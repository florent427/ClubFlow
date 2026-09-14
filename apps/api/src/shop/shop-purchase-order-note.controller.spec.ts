import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ShopPurchaseOrderPdfService } from '../pdf/shop-purchase-order-pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';
import { ShopPurchaseOrderNoteController } from './shop-purchase-order-note.controller';
import type { ShopPurchaseOrderNoteService } from './shop-purchase-order-note.service';

/**
 * Le bon de commande porte les prix d'achat du club. Par en-têtes, seul le
 * back-office du club concerné le lit : le double de Prisma ne connaît qu'une
 * adhésion d'admin, dans `club-1`. Par lien signé, seule une signature valide
 * pour CE club, CETTE commande et CETTE sorte de bon ouvre la porte — le vrai
 * signataire est utilisé, pas un double.
 */

const PDF = Buffer.from('%PDF-1.3 bon de commande');
const DOC = { order: { reference: 'CF-2026-004' } };

function makeController(opts: { doc?: unknown; adminOfClub1?: boolean }) {
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
  const notes = { document: jest.fn(async () => opts.doc ?? null) };
  const pdf = { build: jest.fn(async () => PDF) };
  const links = new ShopDeliveryNoteLinkService();
  const controller = new ShopPurchaseOrderNoteController(
    prisma as unknown as PrismaService,
    notes as unknown as ShopPurchaseOrderNoteService,
    pdf as unknown as ShopPurchaseOrderPdfService,
    links,
  );
  const res = { setHeader: jest.fn(), end: jest.fn() };
  const req = (clubId?: string) =>
    ({
      headers: clubId ? { 'x-club-id': clubId } : {},
      user: { userId: 'u-1' },
    }) as unknown as Request;
  return { controller, notes, pdf, links, res, req, response: res as unknown as Response };
}

describe('ShopPurchaseOrderNoteController — par en-têtes', () => {
  it('refuse sans en-tête de club', async () => {
    const h = makeController({ adminOfClub1: true, doc: DOC });

    await expect(h.controller.purchaseOrder(h.req(), 'po-1', h.response)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse un admin d’un AUTRE club, sans même lire la commande', async () => {
    const h = makeController({ adminOfClub1: true, doc: DOC });

    await expect(
      h.controller.purchaseOrder(h.req('club-2'), 'po-1', h.response),
    ).rejects.toThrow(ForbiddenException);

    expect(h.notes.document).not.toHaveBeenCalled();
    expect(h.res.end).not.toHaveBeenCalled();
  });

  it('refuse un utilisateur sans rôle de back-office', async () => {
    const h = makeController({ adminOfClub1: false, doc: DOC });

    await expect(
      h.controller.purchaseOrder(h.req('club-1'), 'po-1', h.response),
    ).rejects.toThrow(ForbiddenException);

    expect(h.notes.document).not.toHaveBeenCalled();
  });

  it('404 quand la commande n’est pas celle du club', async () => {
    const h = makeController({ adminOfClub1: true, doc: null });

    await expect(
      h.controller.purchaseOrder(h.req('club-1'), 'po-1', h.response),
    ).rejects.toThrow(NotFoundException);

    expect(h.pdf.build).not.toHaveBeenCalled();
  });

  it('sert le PDF au back-office du club, nommé par sa référence, sans cache', async () => {
    const h = makeController({ adminOfClub1: true, doc: DOC });

    await h.controller.purchaseOrder(h.req('club-1'), 'po-1', h.response);

    expect(h.notes.document).toHaveBeenCalledWith('club-1', 'po-1');
    expect(h.res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(h.res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="Bon_de_commande_CF-2026-004.pdf"',
    );
    expect(h.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(h.res.end).toHaveBeenCalledWith(PDF);
  });
});

describe('ShopPurchaseOrderNoteController — par lien signé', () => {
  it('un lien valide pour CE club et CETTE commande ouvre le bon', async () => {
    const h = makeController({ doc: DOC });
    const { exp, sig } = h.links.signPurchaseOrder('club-1', 'po-1');

    await h.controller.signedPurchaseOrder('po-1', 'club-1', String(exp), sig, h.response);

    expect(h.notes.document).toHaveBeenCalledWith('club-1', 'po-1');
    expect(h.res.end).toHaveBeenCalledWith(PDF);
  });

  it('refuse, sans rien lire, le lien d’une autre commande, d’un autre club, ou d’un bon de livraison', async () => {
    const h = makeController({ doc: DOC });
    const bon = h.links.signPurchaseOrder('club-1', 'po-1');
    const livraison = h.links.sign('club-1', 'po-1');

    for (const [id, club, exp, sig] of [
      ['po-2', 'club-1', String(bon.exp), bon.sig],
      ['po-1', 'club-2', String(bon.exp), bon.sig],
      ['po-1', undefined, String(bon.exp), bon.sig],
      ['po-1', 'club-1', String(livraison.exp), livraison.sig],
    ] as const) {
      await expect(
        h.controller.signedPurchaseOrder(id, club, exp, sig, h.response),
      ).rejects.toThrow(ForbiddenException);
    }
    expect(h.notes.document).not.toHaveBeenCalled();
  });

  it('404 quand la commande n’existe plus', async () => {
    const h = makeController({ doc: null });
    const { exp, sig } = h.links.signPurchaseOrder('club-1', 'po-1');

    await expect(
      h.controller.signedPurchaseOrder('po-1', 'club-1', String(exp), sig, h.response),
    ).rejects.toThrow(NotFoundException);
    expect(h.pdf.build).not.toHaveBeenCalled();
  });
});
