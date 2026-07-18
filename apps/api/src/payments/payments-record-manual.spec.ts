import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClubPaymentMethod, InvoiceStatus } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { PaymentsService } from './payments.service';
import { StripeConnectService } from './stripe-connect.service';
import { StripeFeesService } from './stripe-fees.service';

describe('PaymentsService / encaissements manuels', () => {
  let service: PaymentsService;
  let prisma: {
    invoice: { findFirst: jest.Mock; aggregate: jest.Mock };
    member: { findFirst: jest.Mock };
    contact: { findFirst: jest.Mock };
    family: { findFirst: jest.Mock };
    familyMember: { findFirst: jest.Mock };
    clubModule: { findUnique: jest.Mock };
    payment: { aggregate: jest.Mock };
    $transaction: jest.Mock;
  };
  let accounting: { recordIncomeFromPayment: jest.Mock };
  let documentsGating: { hasUnsignedRequiredDocuments: jest.Mock };
  let closeSchedule: jest.Mock;
  let sumInFlight: jest.Mock;

  beforeEach(async () => {
    closeSchedule = jest.fn().mockResolvedValue(undefined);
    // Par défaut : aucun prélèvement en vol sur la facture.
    sumInFlight = jest.fn().mockResolvedValue(0);
    accounting = { recordIncomeFromPayment: jest.fn().mockResolvedValue(undefined) };
    documentsGating = {
      hasUnsignedRequiredDocuments: jest
        .fn()
        .mockResolvedValue({ count: 0, documents: [] }),
    };
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        // Somme des avoirs (sumCreditNotesForInvoice) : aucun avoir dans ces
        // scénarios, mais l'appel doit être mockable sinon le service casse.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      },
      member: { findFirst: jest.fn() },
      contact: { findFirst: jest.fn() },
      family: {
        findFirst: jest.fn().mockResolvedValue({ householdGroupId: null }),
      },
      familyMember: { findFirst: jest.fn() },
      clubModule: {
        // Module DOCUMENTS désactivé par défaut → gating no-op.
        findUnique: jest.fn().mockResolvedValue({ enabled: false }),
      },
      payment: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }),
      },
      $transaction: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountingService, useValue: accounting },
        { provide: DocumentsGatingService, useValue: documentsGating },
        // Non exercées par ces specs, mais le constructeur doit être résoluble.
        { provide: StripeConnectService, useValue: {} },
        {
          provide: StripeFeesService,
          // Frais « best effort » : le double ne fait rien et ne lève jamais,
          // exactement comme le vrai service quand Stripe est indisponible.
          useValue: { syncFeesForPayment: jest.fn().mockResolvedValue(false) },
        },
        { provide: PaymentScheduleService, useValue: {} },
        {
          provide: PaymentScheduleEngineService,
          useValue: {
            closeScheduleForInvoice: closeSchedule,
            sumInFlightForInvoice: sumInFlight,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  const openInvoice = {
    id: 'inv-1',
    clubId: 'club-1',
    familyId: 'fam-1',
    householdGroupId: null as string | null,
    amountCents: 10_000,
    status: InvoiceStatus.OPEN,
    label: 'Cotisation',
  };

  it('refuse un paiement si facture introuvable', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    await expect(
      service.recordManualPayment('club-1', {
        invoiceId: 'nope',
        amountCents: 1000,
        method: ClubPaymentMethod.MANUAL_CASH,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuse un montant supérieur au reste à payer', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amountCents: 8000 },
    });
    await expect(
      service.recordManualPayment('club-1', {
        invoiceId: 'inv-1',
        amountCents: 3000,
        method: ClubPaymentMethod.MANUAL_CHECK,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('premier paiement partiel : pas de passage à PAID, référence trim', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amountCents: null },
    });
    const tx = makeTx();
    prisma.$transaction.mockImplementation(async (fn: (t: InvoiceTx) => Promise<unknown>) => {
      const result = await fn(tx);
      expect(tx.invoice.update).not.toHaveBeenCalled();
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          clubId: 'club-1',
          invoiceId: 'inv-1',
          amountCents: 4000,
          method: ClubPaymentMethod.MANUAL_TRANSFER,
          externalRef: 'VIR-123',
          paidByMemberId: null,
          paidByContactId: null,
        },
      });
      return result;
    });

    const p = await service.recordManualPayment('club-1', {
      invoiceId: 'inv-1',
      amountCents: 4000,
      method: ClubPaymentMethod.MANUAL_TRANSFER,
      externalRef: ' VIR-123 ',
    });

    expect(p.id).toBe('pay-1');
    expect(accounting.recordIncomeFromPayment).toHaveBeenCalledWith(
      'club-1',
      'pay-1',
      'Encaissement Cotisation',
      4000,
    );
  });

  it('paiement qui solde : passage à PAID', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amountCents: 4000 },
    });
    const tx = makeTx('pay-2', 6000);
    prisma.$transaction.mockImplementation(async (fn: (t: InvoiceTx) => Promise<unknown>) => {
      const result = await fn(tx);
      expect(tx.invoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: InvoiceStatus.PAID },
      });
      return result;
    });

    await service.recordManualPayment('club-1', {
      invoiceId: 'inv-1',
      amountCents: 6000,
      method: ClubPaymentMethod.MANUAL_CASH,
    });
  });

  it('paiement qui solde : clôture l’échéancier', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amountCents: 4000 } });
    const tx = makeTx('pay-2', 6000);
    prisma.$transaction.mockImplementation(
      async (fn: (t: InvoiceTx) => Promise<unknown>) => fn(tx),
    );

    await service.recordManualPayment('club-1', {
      invoiceId: 'inv-1',
      amountCents: 6000,
      method: ClubPaymentMethod.MANUAL_CASH,
    });

    expect(closeSchedule).toHaveBeenCalledWith('inv-1', InvoiceStatus.PAID);
  });

  it('ne clôture pas l’échéancier sur un paiement partiel', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amountCents: null } });
    const tx = makeTx();
    prisma.$transaction.mockImplementation(
      async (fn: (t: InvoiceTx) => Promise<unknown>) => fn(tx),
    );

    await service.recordManualPayment('club-1', {
      invoiceId: 'inv-1',
      amountCents: 4000,
      method: ClubPaymentMethod.MANUAL_TRANSFER,
    });

    expect(closeSchedule).not.toHaveBeenCalled();
  });

  it('clôture l’échéancier même si l’écriture comptable échoue', async () => {
    // Régression : la clôture était placée APRÈS le hook comptable. Un club
    // sans compte financier configuré le faisait échouer, et l'échéancier
    // restait ACTIVE sur une facture soldée — l'état exact que le verrou doit
    // empêcher. La sécurité financière ne dépend pas de la comptabilité.
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amountCents: 4000 } });
    const tx = makeTx('pay-3', 6000);
    prisma.$transaction.mockImplementation(
      async (fn: (t: InvoiceTx) => Promise<unknown>) => fn(tx),
    );
    accounting.recordIncomeFromPayment.mockRejectedValue(
      new Error('Aucun compte financier configuré pour ce club.'),
    );

    await expect(
      service.recordManualPayment('club-1', {
        invoiceId: 'inv-1',
        amountCents: 6000,
        method: ClubPaymentMethod.MANUAL_CASH,
      }),
    ).rejects.toThrow('Aucun compte financier');

    // L'échec comptable remonte bien, mais la clôture a eu lieu avant.
    expect(closeSchedule).toHaveBeenCalledWith('inv-1', InvoiceStatus.PAID);
  });

  it('refuse un payeur hors du foyer de la facture', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.member.findFirst.mockResolvedValue({
      id: 'm-bad',
      clubId: 'club-1',
      status: 'ACTIVE',
    });
    prisma.familyMember.findFirst.mockResolvedValue(null);
    await expect(
      service.recordManualPayment('club-1', {
        invoiceId: 'inv-1',
        amountCents: 1000,
        method: ClubPaymentMethod.MANUAL_CASH,
        paidByMemberId: 'm-bad',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse membre et contact payeur en même temps', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    await expect(
      service.recordManualPayment('club-1', {
        invoiceId: 'inv-1',
        amountCents: 1000,
        method: ClubPaymentMethod.MANUAL_CASH,
        paidByMemberId: 'm-1',
        paidByContactId: 'c-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enregistre un paiement avec payeur contact PAYER du foyer', async () => {
    prisma.invoice.findFirst.mockResolvedValue(openInvoice);
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amountCents: null },
    });
    prisma.contact.findFirst.mockResolvedValue({
      id: 'c-1',
      clubId: 'club-1',
    });
    prisma.familyMember.findFirst.mockResolvedValue({ id: 'fm-1' });
    const tx = makeTx();
    prisma.$transaction.mockImplementation(async (fn: (t: InvoiceTx) => Promise<unknown>) => {
      await fn(tx);
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          clubId: 'club-1',
          invoiceId: 'inv-1',
          amountCents: 1000,
          method: ClubPaymentMethod.MANUAL_CASH,
          externalRef: null,
          paidByMemberId: null,
          paidByContactId: 'c-1',
        },
      });
      return { id: 'pay-1', amountCents: 1000, invoiceId: 'inv-1' };
    });

    await service.recordManualPayment('club-1', {
      invoiceId: 'inv-1',
      amountCents: 1000,
      method: ClubPaymentMethod.MANUAL_CASH,
      paidByContactId: 'c-1',
    });
  });
});

type InvoiceTx = {
  payment: { create: jest.Mock };
  invoice: { update: jest.Mock };
};

function makeTx(payId = 'pay-1', amount = 4000): InvoiceTx {
  return {
    payment: {
      create: jest.fn().mockResolvedValue({
        id: payId,
        amountCents: amount,
        invoiceId: 'inv-1',
      }),
    },
    invoice: { update: jest.fn().mockResolvedValue({}) },
  };
}
