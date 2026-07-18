import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { PaymentsService } from './payments.service';
import { StripeConnectService } from './stripe-connect.service';

describe('PaymentsService / Stripe webhook', () => {
  let service: PaymentsService;
  let prisma: {
    stripeWebhookEvent: { findUnique: jest.Mock; create: jest.Mock };
    invoice: { findFirst: jest.Mock; aggregate: jest.Mock; update: jest.Mock };
    payment: { aggregate: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let accounting: { recordIncomeFromPayment: jest.Mock };
  let documentsGating: { hasUnsignedRequiredDocuments: jest.Mock };
  let stripeConnect: { applyAccountUpdated: jest.Mock };
  let paymentSchedules: { applySetupCompleted: jest.Mock };
  let scheduleEngine: { markInstallmentPaid: jest.Mock };

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    accounting = { recordIncomeFromPayment: jest.fn().mockResolvedValue(undefined) };
    documentsGating = {
      hasUnsignedRequiredDocuments: jest
        .fn()
        .mockResolvedValue({ count: 0, documents: [] }),
    };
    stripeConnect = { applyAccountUpdated: jest.fn().mockResolvedValue(undefined) };
    paymentSchedules = { applySetupCompleted: jest.fn().mockResolvedValue(undefined) };
    scheduleEngine = { markInstallmentPaid: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      stripeWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'evt_1' }),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          clubId: 'club-1',
          familyId: null,
          householdGroupId: null,
          status: InvoiceStatus.OPEN,
          amountCents: 5000,
          label: 'Adhésion',
        }),
        // Somme des avoirs (sumCreditNotesForInvoice) : aucun avoir ici.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
        update: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      },
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amountCents: null } }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            create: jest.fn().mockResolvedValue({
              id: 'pay-1',
              amountCents: 5000,
            }),
          },
          invoice: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: DocumentsGatingService, useValue: documentsGating },
        // Dépendances Connect / échéancier : ces specs ne les exercent pas,
        // mais Nest exige que le constructeur soit résoluble.
        { provide: StripeConnectService, useValue: stripeConnect },
        { provide: PaymentScheduleService, useValue: paymentSchedules },
        { provide: PaymentScheduleEngineService, useValue: scheduleEngine },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  it('rejette une signature invalide', async () => {
    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'nope'),
    ).rejects.toThrow(BadRequestException);
  });

  it('traite payment_intent.succeeded idempotent (signature Stripe test)', async () => {
    prisma.stripeWebhookEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'evt_test_1', processedAt: new Date() });

    const payload = {
      id: 'evt_test_1',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_1',
          object: 'payment_intent',
          metadata: { invoiceId: 'inv-1', clubId: 'club-1' },
          amount_received: 5000,
          amount: 5000,
        },
      },
    };
    const raw = JSON.stringify(payload);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    await service.handleStripeWebhook(Buffer.from(raw), header);

    expect(prisma.stripeWebhookEvent.create).toHaveBeenCalledWith({
      data: { id: 'evt_test_1' },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(accounting.recordIncomeFromPayment).toHaveBeenCalledWith(
      'club-1',
      'pay-1',
      'Stripe — Adhésion',
      5000,
    );

    prisma.$transaction.mockClear();
    await service.handleStripeWebhook(Buffer.from(raw), header);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
