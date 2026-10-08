import { Test } from '@nestjs/testing';
import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from '../shop/shop.service';
import { CreditNotesService } from './credit-notes.service';
import { MonthlyContinuationService } from './monthly-continuation.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { PaymentsService } from './payments.service';
import { StripeConnectService } from './stripe-connect.service';
import { StripeFeesService } from './stripe-fees.service';
import { StripeRefundsService } from './stripe-refunds.service';

/**
 * Le webhook Stripe et la suite des cotisations mensuelles : quand la créer,
 * avec quelle carte, et le prélèvement immédiat de ce qui est déjà dû.
 */
describe('Webhook Stripe — suite des cotisations mensuelles', () => {
  let service: PaymentsService;
  let continuation: { createFor: jest.Mock };
  let engine: { markInstallmentPaid: jest.Mock; runDue: jest.Mock };
  let setups: { applySetupCompleted: jest.Mock };
  let alreadyPaid: { id: string } | null;

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    alreadyPaid = null;
    continuation = {
      createFor: jest.fn().mockResolvedValue({
        kind: 'created',
        invoiceId: 'inv-suite',
        scheduleId: 'sched-suite',
        active: true,
      }),
    };
    engine = {
      markInstallmentPaid: jest.fn().mockResolvedValue(undefined),
      runDue: jest.fn().mockResolvedValue({}),
    };
    setups = { applySetupCompleted: jest.fn().mockResolvedValue(undefined) };

    const invoice = {
      id: 'inv-1',
      clubId: 'club-1',
      familyId: null,
      householdGroupId: null,
      status: InvoiceStatus.OPEN,
      amountCents: 9000,
      label: 'Adhésion 2026-2027',
    };
    const invoices = {
      findFirst: jest.fn().mockResolvedValue(invoice),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
    };
    const payments = {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      findFirst: jest.fn(async () => alreadyPaid),
    };
    const prisma = {
      stripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'evt' }),
        delete: jest.fn().mockResolvedValue({ id: 'evt' }),
      },
      club: {
        findUnique: jest.fn().mockResolvedValue({ stripeAccountId: 'acct_sksr' }),
      },
      invoice: invoices,
      payment: payments,
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn().mockResolvedValue(0),
          payment: {
            ...payments,
            create: jest.fn().mockResolvedValue({ id: 'pay-1', amountCents: 9000 }),
          },
          invoice: {
            ...invoices,
            update: jest.fn().mockResolvedValue({}),
          },
          paymentScheduleInstallment: {
            aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
          },
        }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AccountingService,
          useValue: { recordIncomeFromPayment: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ClubFinancialAccountsService, useValue: {} },
        {
          provide: DocumentsGatingService,
          useValue: {
            hasUnsignedRequiredDocuments: jest
              .fn()
              .mockResolvedValue({ count: 0, documents: [] }),
          },
        },
        { provide: StripeConnectService, useValue: {} },
        { provide: MonthlyContinuationService, useValue: continuation },
        {
          provide: StripeFeesService,
          useValue: { syncFeesForPayment: jest.fn().mockResolvedValue(false) },
        },
        { provide: StripeRefundsService, useValue: {} },
        { provide: CreditNotesService, useValue: {} },
        { provide: PaymentScheduleService, useValue: setups },
        { provide: PaymentScheduleEngineService, useValue: engine },
        { provide: ShopService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
  });

  async function deliver(type: string, object: Record<string, unknown>) {
    const raw = JSON.stringify({
      id: `evt_${Math.random()}`,
      object: 'event',
      type,
      account: 'acct_sksr',
      data: { object },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    await service.handleStripeWebhook(Buffer.from(raw), header);
  }

  const adhesionPaid = (extra: Record<string, unknown> = {}) =>
    deliver('payment_intent.succeeded', {
      id: 'pi_adhesion',
      object: 'payment_intent',
      metadata: { invoiceId: 'inv-1', clubId: 'club-1' },
      amount: 9000,
      amount_received: 9000,
      ...extra,
    });

  it('adhésion payée en gardant la carte : la suite naît avec cette carte, et ce qui est dû part', async () => {
    await adhesionPaid({
      setup_future_usage: 'off_session',
      customer: 'cus_1',
      payment_method: 'pm_1',
    });

    expect(continuation.createFor).toHaveBeenCalledWith('club-1', 'inv-1', {
      card: {
        stripeAccountId: 'acct_sksr',
        customerId: 'cus_1',
        paymentMethodId: 'pm_1',
      },
    });
    expect(engine.runDue).toHaveBeenCalledWith({ scheduleId: 'sched-suite' });
  });

  it('une carte utilisée sans accord pour la suite n’est pas réutilisée', async () => {
    continuation.createFor.mockResolvedValueOnce({
      kind: 'created',
      invoiceId: 'inv-suite',
      scheduleId: 'sched-suite',
      active: false,
    });

    await adhesionPaid({ customer: 'cus_1', payment_method: 'pm_1' });

    expect(continuation.createFor).toHaveBeenCalledWith('club-1', 'inv-1', {
      card: null,
    });
    // En attente de carte : rien à prélever.
    expect(engine.runDue).not.toHaveBeenCalled();
  });

  it('un prélèvement d’échéance ne crée pas de suite', async () => {
    await adhesionPaid({
      metadata: { invoiceId: 'inv-1', clubId: 'club-1', installmentId: 'inst-1' },
    });

    expect(engine.markInstallmentPaid).toHaveBeenCalledWith('inst-1', 'pay-1');
    expect(continuation.createFor).not.toHaveBeenCalled();
  });

  it('rejeu après un échec : la suite est reprise', async () => {
    alreadyPaid = { id: 'pay-1' };

    await adhesionPaid({
      setup_future_usage: 'off_session',
      customer: 'cus_1',
      payment_method: 'pm_1',
    });

    expect(continuation.createFor).toHaveBeenCalledTimes(1);
  });

  it('un échec de création fait échouer la livraison, pour que Stripe la rejoue', async () => {
    continuation.createFor.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(adhesionPaid()).rejects.toThrow('base indisponible');
  });

  it('carte enregistrée sur un échéancier : ce qui est déjà dû part aussitôt', async () => {
    await deliver('setup_intent.succeeded', {
      id: 'seti_1',
      object: 'setup_intent',
      metadata: { scheduleId: 'sched-suite' },
      payment_method: 'pm_1',
    });

    expect(setups.applySetupCompleted).toHaveBeenCalled();
    expect(engine.runDue).toHaveBeenCalledWith({ scheduleId: 'sched-suite' });
    expect(engine.runDue.mock.invocationCallOrder[0]).toBeGreaterThan(
      setups.applySetupCompleted.mock.invocationCallOrder[0]!,
    );
  });
});
