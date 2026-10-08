import { Test } from '@nestjs/testing';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyContinuationService } from './monthly-continuation.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Page de paiement d'une adhésion au rythme mensuel : la carte y est gardée
 * pour les mois suivants, et l'adhérent y lit ce qu'il autorise. Sans cet
 * accord, le moteur ne pourrait pas la redébiter.
 */
describe('StripeCheckoutService — carte gardée pour les mensualités', () => {
  let service: StripeCheckoutService;
  let sessions: { create: jest.Mock };
  let consent: jest.Mock;

  beforeEach(async () => {
    consent = jest.fn();
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          clubId: 'club-1',
          label: 'Adhésion 2026-2027',
          amountCents: 9000,
          status: InvoiceStatus.OPEN,
          isCreditNote: false,
        }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      },
      club: {
        findUnique: jest.fn().mockResolvedValue({ slug: 'sksr', name: 'SKSR' }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StripeCheckoutService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StripeConnectService,
          useValue: { requireChargeableAccount: jest.fn().mockResolvedValue('acct_sksr') },
        },
        { provide: MonthlyContinuationService, useValue: { consentForCheckout: consent } },
      ],
    }).compile();
    service = moduleRef.get(StripeCheckoutService);
    sessions = {
      create: jest.fn().mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' }),
    };
    jest
      .spyOn(service as unknown as { getStripe: () => unknown }, 'getStripe')
      .mockReturnValue({ checkout: { sessions } });
  });

  type Params = {
    payment_intent_data: { setup_future_usage?: string };
    customer_creation?: string;
    custom_text?: { submit: { message: string } };
  };
  const pay = async (installmentsCount?: number): Promise<Params> => {
    await service.createInvoiceCheckoutSession({
      invoiceId: 'inv-1',
      clubId: 'club-1',
      paidByMemberId: null,
      installmentsCount,
    });
    return sessions.create.mock.calls[0]![0] as Params;
  };

  it('cotisation mensuelle : carte gardée, accord affiché', async () => {
    consent.mockResolvedValue('Cotisation mensuelle : en payant, vous autorisez SKSR…');

    const params = await pay();

    expect(consent).toHaveBeenCalledWith('club-1', 'inv-1', 'SKSR');
    expect(params.payment_intent_data.setup_future_usage).toBe('off_session');
    expect(params.customer_creation).toBe('always');
    expect(params.custom_text?.submit.message).toContain('vous autorisez SKSR');
  });

  it('pas de cotisation mensuelle : la carte n’est pas gardée', async () => {
    consent.mockResolvedValue(null);

    const params = await pay();

    expect(params.payment_intent_data.setup_future_usage).toBeUndefined();
    expect(params.customer_creation).toBeUndefined();
    expect(params.custom_text).toBeUndefined();
  });

  it('paiement en plusieurs fois par carte : jamais combiné à une carte gardée', async () => {
    consent.mockResolvedValue('accord');

    const params = await pay(3);

    expect(consent).not.toHaveBeenCalled();
    expect(params.payment_intent_data.setup_future_usage).toBeUndefined();
  });
});
