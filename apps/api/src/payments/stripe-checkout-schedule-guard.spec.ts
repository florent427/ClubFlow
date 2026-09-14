import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus, PaymentScheduleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Verrou 1 du dispositif anti double encaissement (cf. ADR-0009).
 *
 * Une facture couverte par un échéancier ne doit pas pouvoir être réglée en
 * une fois par ailleurs : le paiement solderait la facture sans éteindre le
 * plan, et le moteur continuerait de prélever.
 *
 * Le contrôle vit dans le SERVICE et non dans les resolvers, parce que c'est
 * le seul point de passage commun au portail, au mobile — y compris les
 * versions déjà installées, qu'on ne peut pas corriger à distance — et à tout
 * futur client. Ces tests verrouillent cet emplacement autant que la règle.
 */
describe('StripeCheckoutService — refus si un échéancier couvre la facture', () => {
  let service: StripeCheckoutService;
  let prisma: {
    invoice: { findFirst: jest.Mock; aggregate: jest.Mock };
    payment: { aggregate: jest.Mock };
    club: { findUnique: jest.Mock };
  };
  let connect: { requireChargeableAccount: jest.Mock };

  const baseInvoice = {
    id: 'inv-1',
    clubId: 'club-1',
    amountCents: 60_000,
    status: InvoiceStatus.OPEN,
    isCreditNote: false,
  };

  beforeEach(async () => {
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        // Avoirs émis sur la facture : aucun par défaut.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      },
      club: {
        findUnique: jest.fn().mockResolvedValue({ slug: 'qa', name: 'QA' }),
      },
    };
    // Si un test atteint Stripe, c'est que le garde-fou a cédé : on veut un
    // échec bruyant plutôt qu'un appel réseau silencieux.
    connect = {
      requireChargeableAccount: jest
        .fn()
        .mockRejectedValue(new Error('Stripe ne doit pas être appelé ici')),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StripeCheckoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeConnectService, useValue: connect },
      ],
    }).compile();

    service = moduleRef.get(StripeCheckoutService);
  });

  const call = () =>
    service.createInvoiceCheckoutSession({
      invoiceId: 'inv-1',
      clubId: 'club-1',
      paidByMemberId: null,
    });

  it('refuse quand un échéancier est ACTIVE', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      paymentSchedule: { status: PaymentScheduleStatus.ACTIVE },
    });

    await expect(call()).rejects.toThrow(BadRequestException);
    await expect(call()).rejects.toThrow(/échéancier/i);
    expect(connect.requireChargeableAccount).not.toHaveBeenCalled();
  });

  it('refuse quand l’échéancier attend encore sa signature (PENDING_SETUP)', async () => {
    // Le plan n'est pas encore prélevable, mais il le deviendra : autoriser le
    // paiement ici créerait le doublon dès la signature du mandat.
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      paymentSchedule: { status: PaymentScheduleStatus.PENDING_SETUP },
    });

    await expect(call()).rejects.toThrow(BadRequestException);
    expect(connect.requireChargeableAccount).not.toHaveBeenCalled();
  });

  it('autorise quand l’échéancier a été annulé', async () => {
    // Sinon l'adhérent qui renonce à l'échelonnement ne pourrait plus payer :
    // le garde-fou deviendrait un cul-de-sac.
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      paymentSchedule: { status: PaymentScheduleStatus.CANCELLED },
    });

    // On ne va pas jusqu'à Stripe : franchir le garde-fou suffit à le prouver.
    await expect(call()).rejects.toThrow('Stripe ne doit pas être appelé ici');
    expect(connect.requireChargeableAccount).toHaveBeenCalled();
  });

  it('autorise quand l’échéancier est terminé', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      paymentSchedule: { status: PaymentScheduleStatus.COMPLETED },
    });

    await expect(call()).rejects.toThrow('Stripe ne doit pas être appelé ici');
    expect(connect.requireChargeableAccount).toHaveBeenCalled();
  });

  it('autorise une facture sans échéancier', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      paymentSchedule: null,
    });

    await expect(call()).rejects.toThrow('Stripe ne doit pas être appelé ici');
    expect(connect.requireChargeableAccount).toHaveBeenCalled();
  });

  it('refuse une facture déjà soldée avant même de regarder l’échéancier', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(call()).rejects.toThrow(NotFoundException);
    expect(connect.requireChargeableAccount).not.toHaveBeenCalled();
  });

  it('charge bien l’échéancier dans la requête : sans lui, le contrôle est aveugle', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      paymentSchedule: null,
    });

    await call().catch(() => undefined);

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          paymentSchedule: expect.anything(),
        }),
      }),
    );
  });
});

/**
 * Le solde demandé déduit les avoirs (ADR-0011, ADR-0020). Sans eux, une
 * facture ouverte dont un article a été annulé demanderait ce que le club ne
 * réclame plus ; le webhook, qui les déduit, n'en enregistrerait qu'une partie.
 */
describe('StripeCheckoutService — le solde demandé déduit les avoirs', () => {
  const invoice = {
    id: 'inv-1',
    clubId: 'club-1',
    amountCents: 4000,
    label: 'Commande boutique — Camille',
    status: InvoiceStatus.OPEN,
    isCreditNote: false,
    paymentSchedule: null,
  };

  async function make(paidCents: number, creditNotesCents: number) {
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        aggregate: jest.fn(async ({ where }: any) => {
          // Seuls les avoirs non annulés de CETTE facture comptent.
          expect(where).toEqual({
            parentInvoiceId: 'inv-1',
            isCreditNote: true,
            status: { not: InvoiceStatus.VOID },
          });
          return { _sum: { amountCents: creditNotesCents || null } };
        }),
      },
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amountCents: paidCents || null } }),
      },
      club: { findUnique: jest.fn().mockResolvedValue({ slug: 'qa', name: 'QA' }) },
    };
    const connect = { requireChargeableAccount: jest.fn().mockResolvedValue('acct_1') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StripeCheckoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeConnectService, useValue: connect },
      ],
    }).compile();
    const service = moduleRef.get(StripeCheckoutService);
    const create = jest.fn(async (params: any) => ({
      id: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
      params,
    }));
    (service as unknown as { getStripe: () => unknown }).getStripe = () => ({
      checkout: { sessions: { create } },
    });
    return { service, create, connect };
  }

  it('demande le solde avoirs déduits', async () => {
    const h = await make(1000, 2500);

    await h.service
      .createInvoiceCheckoutSession({ invoiceId: 'inv-1', clubId: 'club-1', paidByMemberId: null })
      .catch(() => undefined);

    expect(h.create).toHaveBeenCalledTimes(1);
    const params = h.create.mock.calls[0][0];
    // 40 € − 10 € encaissés − 25 € d'avoir = 5 €.
    expect(params.line_items[0].price_data.unit_amount).toBe(500);
  });

  it('facture entièrement éteinte par ses avoirs : refus avant Stripe', async () => {
    const h = await make(1500, 2500);

    await expect(
      h.service.createInvoiceCheckoutSession({
        invoiceId: 'inv-1',
        clubId: 'club-1',
        paidByMemberId: null,
      }),
    ).rejects.toThrow('Facture déjà soldée.');

    expect(h.connect.requireChargeableAccount).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});
