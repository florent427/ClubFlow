import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceStatus } from '@prisma/client';
import Stripe from 'stripe';
import { AccountingService } from '../accounting/accounting.service';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService / Stripe webhook', () => {
  let service: PaymentsService;
  let prisma: {
    stripeWebhookEvent: { findUnique: jest.Mock; create: jest.Mock };
    invoice: { findFirst: jest.Mock };
    payment: { aggregate: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let accounting: { recordIncomeFromPayment: jest.Mock };
  let documentsGating: { hasUnsignedRequiredDocuments: jest.Mock };

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    accounting = { recordIncomeFromPayment: jest.fn().mockResolvedValue(undefined) };
    documentsGating = {
      hasUnsignedRequiredDocuments: jest
        .fn()
        .mockResolvedValue({ count: 0, documents: [] }),
    };
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
