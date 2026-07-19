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
import { StripeFeesService } from './stripe-fees.service';
import { StripeRefundsService } from './stripe-refunds.service';
import { CreditNotesService } from './credit-notes.service';

describe('PaymentsService / Stripe webhook', () => {
  let service: PaymentsService;
  let prisma: {
    stripeWebhookEvent: {
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    invoice: { findFirst: jest.Mock; aggregate: jest.Mock; update: jest.Mock };
    payment: { aggregate: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let accounting: { recordIncomeFromPayment: jest.Mock };
  let stripeFees: { syncFeesForPayment: jest.Mock };
  let documentsGating: { hasUnsignedRequiredDocuments: jest.Mock };
  let stripeConnect: { applyAccountUpdated: jest.Mock };
  let paymentSchedules: { applySetupCompleted: jest.Mock };
  let scheduleEngine: { markInstallmentPaid: jest.Mock };

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    accounting = { recordIncomeFromPayment: jest.fn().mockResolvedValue(undefined) };
    // Frais « best effort » : par défaut le double ne trouve rien, comme le
    // vrai service face à une charge SEPA non dénouée.
    stripeFees = { syncFeesForPayment: jest.fn().mockResolvedValue(false) };
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
        // Libération de la réservation quand le traitement échoue.
        delete: jest.fn().mockResolvedValue({ id: 'evt_1' }),
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
        { provide: StripeFeesService, useValue: stripeFees },
        // Remboursements : non exercés par ces specs, mais le constructeur
        // doit rester résoluble.
        { provide: StripeRefundsService, useValue: {} },
        { provide: CreditNotesService, useValue: {} },
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
    // La réservation d'idempotence est un `create` : la 1re livraison le
    // réussit, la 2e se heurte à la contrainte d'unicité et sort aussitôt.
    prisma.stripeWebhookEvent.create
      .mockResolvedValueOnce({ id: 'evt_test_1' })
      .mockRejectedValueOnce(new Error('Unique constraint failed'));

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

    // Les frais sont tentés APRÈS la recette, sur le paiement qui vient
    // d'être créé. Sans cette assertion, supprimer l'appel laisserait la
    // suite verte — vérifié par mutation lors de la revue du 2026-07-18.
    expect(stripeFees.syncFeesForPayment).toHaveBeenCalledWith('pay-1');
    const ordreRecette =
      accounting.recordIncomeFromPayment.mock.invocationCallOrder[0];
    const ordreFrais = stripeFees.syncFeesForPayment.mock.invocationCallOrder[0];
    expect(ordreFrais).toBeGreaterThan(ordreRecette);

    prisma.$transaction.mockClear();
    await service.handleStripeWebhook(Buffer.from(raw), header);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('libère la réservation quand le traitement échoue, pour que Stripe puisse rejouer', async () => {
    // Régression : le marqueur d'idempotence était posé AVANT le traitement.
    // Un échec en cours de route laissait l'événement marqué comme traité, et
    // la réessai de Stripe sortait aussitôt — le travail restant était perdu
    // définitivement. Constaté en staging (échéance encaissée non rattachée).
    prisma.$transaction.mockRejectedValueOnce(new Error('base indisponible'));

    const payload = {
      id: 'evt_test_fail',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_fail',
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

    // L'erreur doit remonter : c'est elle qui fait répondre 500 à Stripe et
    // déclenche la réessai.
    await expect(
      service.handleStripeWebhook(Buffer.from(raw), header),
    ).rejects.toThrow('base indisponible');

    // Et la réservation doit avoir été retirée, sinon la réessai serait vaine.
    expect(prisma.stripeWebhookEvent.delete).toHaveBeenCalledWith({
      where: { id: 'evt_test_fail' },
    });
  });

  it('un service de frais en panne ne casse pas l’encaissement', async () => {
    // Invariant cardinal du lot frais : les frais sont du confort comptable.
    // Si leur récupération lève, la recette et la facture doivent rester
    // acquises — et le webhook doit répondre 200, sinon Stripe rejouerait
    // indéfiniment un encaissement pourtant correctement enregistré.
    stripeFees.syncFeesForPayment.mockRejectedValue(new Error('Stripe down'));
    prisma.stripeWebhookEvent.create.mockResolvedValueOnce({ id: 'evt_boom' });

    const payload = {
      id: 'evt_boom',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_2',
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

    await expect(
      service.handleStripeWebhook(Buffer.from(raw), header),
    ).resolves.toBeUndefined();

    expect(accounting.recordIncomeFromPayment).toHaveBeenCalled();
    // La réservation d'idempotence NE doit pas être libérée : le traitement a
    // réussi, seul l'accessoire a échoué.
    expect(prisma.stripeWebhookEvent.delete).not.toHaveBeenCalled();
  });

});
