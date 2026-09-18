import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClubPaymentMethod, InvoicePurpose, InvoiceStatus } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from '../shop/shop.service';
import { CreditNotesService } from './credit-notes.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { PaymentsService } from './payments.service';
import { StripeConnectService } from './stripe-connect.service';
import { StripeFeesService } from './stripe-fees.service';
import { StripeRefundsService } from './stripe-refunds.service';

/**
 * Encaisser une avance sans facture (ADR-0022, §2) : un reçu d'avance naît
 * PAYÉ avec son paiement, et sa fiche chèque, dans une seule transaction ;
 * l'écriture suit le commit.
 */

type Events = string[];

/** Le `where` comme Prisma : clause absente = aucun filtre, clause inconnue = erreur. */
function selon<T extends Record<string, unknown>>(
  rows: T[],
  where: Record<string, unknown>,
  champs: string[],
): T[] {
  for (const cle of Object.keys(where)) {
    if (!champs.includes(cle)) throw new Error(`Clause non simulée : ${cle}`);
  }
  return rows.filter((row) =>
    Object.entries(where).every(([cle, clause]) => clause === undefined || row[cle] === clause),
  );
}

function harness() {
  const events: Events = [];
  const members = [
    { id: 'm-camille', clubId: 'club-1', userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire' },
  ];
  const contacts = [
    { id: 'c-parent', clubId: 'club-1', userId: 'u-parent', firstName: 'Paul', lastName: 'Parent' },
  ];
  const invoices: Array<{ id: string; clubId: string; purpose: InvoicePurpose; status: InvoiceStatus }> = [
    { id: 'recu-1', clubId: 'club-1', purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT, status: InvoiceStatus.PAID },
  ];

  const tx = {
    invoice: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('tx:reçu');
        return { id: 'recu-neuf', ...data };
      }),
    },
    payment: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('tx:paiement');
        return { id: 'paie-neuf', ...data };
      }),
    },
    cheque: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('tx:chèque');
        return { id: 'cheque-neuf', ...data };
      }),
    },
  };

  const prisma = {
    member: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(members, where, ['id', 'clubId', 'userId'])[0] ?? null,
      ),
    },
    contact: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(contacts, where, ['id', 'clubId'])[0] ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        selon(contacts, where, ['clubId', 'userId']),
      ),
    },
    invoice: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const inv = selon(invoices, where, ['id', 'clubId'])[0];
        return inv ? { ...inv, payments: [{ id: 'p-recu', amountCents: 2000 }] } : null;
      }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const result = await fn(tx);
      events.push('commit');
      return result;
    }),
  };

  const accounting = {
    recordIncomeFromPayment: jest.fn(async () => {
      events.push('écriture');
    }),
  };
  const financialAccounts = {
    getById: jest.fn(async (_clubId: string, id: string) =>
      id === 'fa-banque'
        ? { id, kind: 'BANK', isActive: true }
        : { id, kind: 'CASH', isActive: true },
    ),
  };
  const creditNotes = { create: jest.fn(), recordAccounting: jest.fn() };

  return { events, tx, prisma, accounting, financialAccounts, creditNotes };
}

async function service(h: ReturnType<typeof harness>): Promise<PaymentsService> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: PrismaService, useValue: h.prisma },
      { provide: AccountingService, useValue: h.accounting },
      { provide: ClubFinancialAccountsService, useValue: h.financialAccounts },
      { provide: DocumentsGatingService, useValue: {} },
      { provide: StripeConnectService, useValue: {} },
      { provide: StripeFeesService, useValue: {} },
      { provide: StripeRefundsService, useValue: {} },
      { provide: CreditNotesService, useValue: h.creditNotes },
      { provide: PaymentScheduleService, useValue: {} },
      { provide: PaymentScheduleEngineService, useValue: { closeScheduleForInvoice: jest.fn() } },
      { provide: ShopService, useValue: {} },
    ],
  }).compile();
  return moduleRef.get(PaymentsService);
}

describe('PaymentsService.recordPayerCreditDeposit', () => {
  it('espèces : reçu PAYÉ au nom du membre et paiement dans la transaction, écriture après le commit', async () => {
    const h = harness();
    const svc = await service(h);

    const res = await svc.recordPayerCreditDeposit(
      'club-1',
      { memberId: 'm-camille', amountCents: 2000, method: ClubPaymentMethod.MANUAL_CASH },
      'user-admin',
    );

    expect(h.events).toEqual(['tx:reçu', 'tx:paiement', 'commit', 'écriture']);
    expect(h.tx.invoice.create).toHaveBeenCalledWith({
      data: {
        clubId: 'club-1',
        label: 'Avance — Camille Titulaire',
        baseAmountCents: 2000,
        amountCents: 2000,
        status: InvoiceStatus.PAID,
        purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
        payerCreditMemberId: 'm-camille',
        payerCreditContactId: null,
      },
    });
    expect(h.tx.payment.create).toHaveBeenCalledWith({
      data: {
        clubId: 'club-1',
        invoiceId: 'recu-neuf',
        amountCents: 2000,
        method: ClubPaymentMethod.MANUAL_CASH,
        externalRef: null,
        paidByMemberId: 'm-camille',
        paidByContactId: null,
        // Le compte qui a saisi l'avance au guichet.
        recordedByUserId: 'user-admin',
      },
    });
    expect(h.tx.cheque.create).not.toHaveBeenCalled();
    expect(h.accounting.recordIncomeFromPayment).toHaveBeenCalledWith(
      'club-1',
      'paie-neuf',
      'Avance — Camille Titulaire',
      2000,
      null,
    );
    expect(res.invoice.id).toBe('recu-neuf');
  });

  it('chèque : la fiche naît dans la même transaction, émetteur = la personne', async () => {
    const h = harness();
    const svc = await service(h);

    await svc.recordPayerCreditDeposit(
      'club-1',
      { contactId: 'c-parent', amountCents: 3000, method: ClubPaymentMethod.MANUAL_CHECK, externalRef: ' 4917496 ' },
      'user-admin',
    );

    expect(h.events).toEqual(['tx:reçu', 'tx:paiement', 'tx:chèque', 'commit', 'écriture']);
    expect(h.tx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ payerCreditMemberId: null, payerCreditContactId: 'c-parent' }),
    });
    expect(h.tx.cheque.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-1',
        paymentId: 'paie-neuf',
        number: '4917496',
        drawerName: 'Paul Parent',
        amountCents: 3000,
        createdByUserId: 'user-admin',
      }),
    });
  });

  it('refuse la carte : une avance saisie par l’admin se paie en espèces, par chèque ou par virement', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(
      svc.recordPayerCreditDeposit('club-1', { memberId: 'm-camille', amountCents: 2000, method: ClubPaymentMethod.STRIPE_CARD }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un montant nul, négatif ou fractionnaire, même sans la validation d’entrée', async () => {
    const h = harness();
    const svc = await service(h);

    for (const amountCents of [0, -500, 12.5]) {
      await expect(
        svc.recordPayerCreditDeposit('club-1', {
          memberId: 'm-camille',
          amountCents,
          method: ClubPaymentMethod.MANUAL_CASH,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse sans personne, ou avec deux', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(
      svc.recordPayerCreditDeposit('club-1', { amountCents: 2000, method: ClubPaymentMethod.MANUAL_CASH }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.recordPayerCreditDeposit('club-1', {
        memberId: 'm-camille',
        contactId: 'c-parent',
        amountCents: 2000,
        method: ClubPaymentMethod.MANUAL_CASH,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse une personne d’un autre club', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(
      svc.recordPayerCreditDeposit('club-2', { memberId: 'm-camille', amountCents: 2000, method: ClubPaymentMethod.MANUAL_CASH }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('virement sur une banque imposée : elle doit être une banque active, et elle reçoit l’écriture', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(
      svc.recordPayerCreditDeposit('club-1', {
        memberId: 'm-camille',
        amountCents: 2000,
        method: ClubPaymentMethod.MANUAL_TRANSFER,
        financialAccountId: 'fa-caisse',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await svc.recordPayerCreditDeposit('club-1', {
      memberId: 'm-camille',
      amountCents: 2000,
      method: ClubPaymentMethod.MANUAL_TRANSFER,
      financialAccountId: 'fa-banque',
    });
    expect(h.accounting.recordIncomeFromPayment).toHaveBeenCalledWith(
      'club-1',
      'paie-neuf',
      'Avance — Camille Titulaire',
      2000,
      'fa-banque',
    );
  });

  it('un échec comptable ne défait pas l’avance déjà encaissée', async () => {
    const h = harness();
    h.accounting.recordIncomeFromPayment.mockRejectedValue(new Error('Compte comptable 419100 introuvable'));
    const svc = await service(h);

    const res = await svc.recordPayerCreditDeposit('club-1', {
      memberId: 'm-camille',
      amountCents: 2000,
      method: ClubPaymentMethod.MANUAL_CASH,
    });

    expect(res.payment.id).toBe('paie-neuf');
  });
});

describe('PaymentsService — un reçu d’avance n’est pas une dette', () => {
  it('ne s’encaisse pas', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(
      svc.recordManualPayment('club-1', { invoiceId: 'recu-1', amountCents: 500, method: ClubPaymentMethod.MANUAL_CASH }),
    ).rejects.toThrow('reçu d’avance est déjà encaissé');
  });

  it('ne s’annule pas', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(svc.voidInvoice('club-1', 'recu-1', 'erreur')).rejects.toThrow('ne s’annule pas');
  });

  it('ne reçoit pas d’avoir manuel', async () => {
    const h = harness();
    const svc = await service(h);

    await expect(svc.createCreditNote('club-1', 'recu-1', 'erreur', 500)).rejects.toThrow('ne reçoit pas d’avoir');
    expect(h.creditNotes.create).not.toHaveBeenCalled();
  });
});
