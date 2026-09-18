import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Le payeur voyage dans les métadonnées de la session : c'est tout ce que le
 * webhook recevra pour inscrire un nom sur l'encaissement. Un parent non
 * adhérent, qui règle en ligne la cotisation de son enfant, n'a pas de fiche
 * de membre : sans `paidByContactId`, la facture affichait « Règlement » sans
 * nom (audit du 2026-09-14, point 2.2).
 */
describe('StripeCheckoutService — le payeur passé à Stripe', () => {
  let service: StripeCheckoutService;
  let sessions: { create: jest.Mock };

  beforeEach(async () => {
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          clubId: 'club-1',
          label: 'Cotisation saison',
          amountCents: 12_000,
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
        findUnique: jest.fn().mockResolvedValue({ slug: 'qa', name: 'QA' }),
      },
    };
    const connect = {
      requireChargeableAccount: jest.fn().mockResolvedValue('acct_club'),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StripeCheckoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeConnectService, useValue: connect },
      ],
    }).compile();

    service = moduleRef.get(StripeCheckoutService);
    sessions = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/cs_1' }),
    };
    jest
      .spyOn(service as unknown as { getStripe: () => unknown }, 'getStripe')
      .mockReturnValue({ checkout: { sessions } });
  });

  /** Les métadonnées de la session, telles que Stripe les rendra au webhook. */
  const metadonnees = async (
    payeur: { paidByMemberId: string | null; paidByContactId?: string | null },
  ): Promise<Record<string, string>> => {
    await service.createInvoiceCheckoutSession({
      invoiceId: 'inv-1',
      clubId: 'club-1',
      ...payeur,
    });
    const [params] = sessions.create.mock.calls[0] as [
      { metadata: Record<string, string>; payment_intent_data: { metadata: Record<string, string> } },
    ];
    // Le webhook lit celles du paiement : les deux doivent porter le payeur.
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
    return params.metadata;
  };

  it('un payeur membre voyage dans la session', async () => {
    expect(await metadonnees({ paidByMemberId: 'm-1' })).toMatchObject({
      invoiceId: 'inv-1',
      clubId: 'club-1',
      paidByMemberId: 'm-1',
    });
  });

  it('un payeur contact voyage aussi : le parent non adhérent est nommé', async () => {
    const meta = await metadonnees({
      paidByMemberId: null,
      paidByContactId: 'c-1',
    });
    expect(meta.paidByContactId).toBe('c-1');
    expect(meta.paidByMemberId).toBeUndefined();
  });

  it('jamais deux payeurs : la fiche de membre l’emporte', async () => {
    const meta = await metadonnees({
      paidByMemberId: 'm-1',
      paidByContactId: 'c-1',
    });
    expect(meta.paidByMemberId).toBe('m-1');
    expect(meta.paidByContactId).toBeUndefined();
  });

  it('sans payeur, aucune des deux clés', async () => {
    const meta = await metadonnees({
      paidByMemberId: null,
      paidByContactId: null,
    });
    expect(meta.paidByMemberId).toBeUndefined();
    expect(meta.paidByContactId).toBeUndefined();
  });
});
