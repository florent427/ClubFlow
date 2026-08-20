import { BadRequestException } from '@nestjs/common';
import {
  InvoiceStatus,
  MembershipCartStatus,
  PaymentScheduleStatus,
} from '@prisma/client';
import { MembershipCartService } from './membership-cart.service';

/**
 * Garde-fou de la réouverture d'un panier d'adhésion validé.
 *
 * Rouvrir un panier annule sa facture (VOID). Tant que rien n'a été
 * encaissé, c'est sans conséquence : le payeur corrige puis revalide.
 * Dès qu'un règlement existe — même partiel, même seulement programmé
 * par un échéancier — l'annuler laisserait un encaissement orphelin,
 * rattaché à une facture morte.
 *
 * Le contrôle vit dans le SERVICE et non dans le resolver : c'est le
 * seul point de passage commun au portail, au mobile — y compris les
 * versions déjà installées — et à tout futur client.
 *
 * Ces tests vérifient le COMPORTEMENT (la facture reste vivante, le
 * panier reste validé), pas la seule présence d'un `throw`.
 */
describe('MembershipCartService.reopenCart — refus si un règlement existe', () => {
  let service: MembershipCartService;
  let prisma: {
    invoice: { findFirst: jest.Mock; updateMany: jest.Mock };
    payment: { aggregate: jest.Mock };
    membershipCart: { update: jest.Mock; findFirst: jest.Mock };
    membershipCartItem: { delete: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const CART_ID = 'cart-1';
  const CLUB_ID = 'club-1';
  const INVOICE_ID = 'inv-1';

  /** Panier validé, rattaché à une facture. */
  const validatedCart = {
    id: CART_ID,
    clubId: CLUB_ID,
    status: MembershipCartStatus.VALIDATED,
    invoiceId: INVOICE_ID,
  };

  beforeEach(() => {
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      },
      membershipCartItem: {
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      membershipCart: {
        findFirst: jest.fn().mockResolvedValue(validatedCart),
        update: jest.fn().mockResolvedValue({
          ...validatedCart,
          status: MembershipCartStatus.OPEN,
          invoiceId: null,
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    service = new MembershipCartService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    // `getCartById` fait des jointures qui n'ont rien à voir avec le
    // garde-fou : on le neutralise pour tester la règle seule.
    jest
      .spyOn(
        service as unknown as { getCartById: () => unknown },
        'getCartById',
      )
      .mockResolvedValue(validatedCart as never);
  });

  /** Aucune écriture ne doit avoir eu lieu quand le garde-fou joue. */
  function expectRienModifie(): void {
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.membershipCart.update).not.toHaveBeenCalled();
  }

  it('refuse quand un paiement partiel a été encaissé', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      status: InvoiceStatus.OPEN,
      paymentSchedule: null,
    });
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amountCents: 5_000 },
    });

    await expect(service.reopenCart(CLUB_ID, CART_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectRienModifie();
  });

  it('refuse quand la facture est déjà soldée', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      status: InvoiceStatus.PAID,
      paymentSchedule: null,
    });

    await expect(service.reopenCart(CLUB_ID, CART_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectRienModifie();
  });

  it.each([
    PaymentScheduleStatus.ACTIVE,
    PaymentScheduleStatus.PENDING_SETUP,
  ])('refuse quand un échéancier est %s', async (status) => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      status: InvoiceStatus.OPEN,
      paymentSchedule: { status },
    });

    await expect(service.reopenCart(CLUB_ID, CART_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectRienModifie();
  });

  it('refuse un panier qui n’est pas validé', async () => {
    jest
      .spyOn(
        service as unknown as { getCartById: () => unknown },
        'getCartById',
      )
      .mockResolvedValue({
        ...validatedCart,
        status: MembershipCartStatus.OPEN,
      } as never);

    await expect(service.reopenCart(CLUB_ID, CART_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectRienModifie();
  });

  it('rouvre quand rien n’a été encaissé : facture VOID et panier OPEN', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      status: InvoiceStatus.OPEN,
      paymentSchedule: null,
    });

    await service.reopenCart(CLUB_ID, CART_ID);

    // La facture est annulée, jamais supprimée — et seulement si elle est
    // encore DRAFT/OPEN (garde anti-course avec un encaissement concurrent).
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: INVOICE_ID,
          status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.OPEN] },
        }),
        data: expect.objectContaining({ status: InvoiceStatus.VOID }),
      }),
    );
    // ⚠️ Le contenu du panier DOIT survivre : c'est tout l'intérêt de la
    // réouverture — le payeur retrouve sa sélection pré-remplie, la
    // corrige, puis relance le paiement. Un panier vidé le renverrait à
    // zéro et rendrait le bouton inutile.
    expect(prisma.membershipCartItem.delete).not.toHaveBeenCalled();
    expect(prisma.membershipCartItem.deleteMany).not.toHaveBeenCalled();

    // Le panier redevient modifiable et se détache de la facture morte.
    expect(prisma.membershipCart.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CART_ID },
        data: expect.objectContaining({
          status: MembershipCartStatus.OPEN,
          validatedAt: null,
          invoiceId: null,
        }),
      }),
    );
  });

  /**
   * Le bouton « Modifier mon adhésion » ne s'affiche que si l'écran
   * reçoit un panier récupérable. Lecture et écriture partagent le même
   * `reopenBlockedReason` : proposer une action qui échouerait au clic
   * serait pire que ne rien proposer.
   */
  describe('findReopenableCartForFamily — ce que l’écran a le droit d’afficher', () => {
    it('expose le panier validé quand rien n’a été encaissé', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: InvoiceStatus.OPEN,
        paymentSchedule: null,
      });

      await expect(
        service.findReopenableCartForFamily(CLUB_ID, 'family-1', 'season-1'),
      ).resolves.toMatchObject({ id: CART_ID });
    });

    it('n’expose rien dès qu’un règlement est encaissé', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: InvoiceStatus.OPEN,
        paymentSchedule: null,
      });
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amountCents: 1 },
      });

      await expect(
        service.findReopenableCartForFamily(CLUB_ID, 'family-1', 'season-1'),
      ).resolves.toBeNull();
    });
  });
});
