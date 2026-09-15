import {
  AccountingEntryKind,
  AccountingLineSide,
  InvoicePurpose,
} from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Une avance encaissée n'est pas une recette (ADR-0022, §5) : l'argent entre en
 * trésorerie et attend en 419100 d'être utilisé sur une facture. L'écriture est
 * un TRANSFER, hors résultat, sans ventilation analytique.
 */

type Line = {
  accountCode: string;
  side: AccountingLineSide;
  debitCents: number;
  creditCents: number;
};

function harness(purpose: InvoicePurpose) {
  const lines: Line[] = [];
  const entries: Array<{ kind: AccountingEntryKind }> = [];
  const allocation = {
    buildAllocationsForInvoice: jest.fn(async () => [
      { amountCents: 2000, memberId: 'm-1' },
    ]),
    persistAllocationsForLine: jest.fn(async () => undefined),
  };

  const tx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: { kind: AccountingEntryKind } }) => {
        entries.push(data);
        return { id: 'entry-1' };
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Line }) => {
        lines.push(data);
        return { id: `line-${lines.length}`, ...data };
      }),
    },
    payment: { update: jest.fn(async () => ({})) },
  };

  const prisma = {
    clubModule: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
    accountingEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    payment: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; clubId: string } }) =>
          where.id === 'pay-1' && where.clubId === 'club-1'
            ? {
                id: 'pay-1',
                clubId: 'club-1',
                method: 'MANUAL_CASH',
                amountCents: 2000,
                createdAt: new Date('2026-09-15T00:00:00Z'),
                financialAccountId: null,
                invoice: {
                  id: 'inv-1',
                  label: 'Avance — Camille Titulaire',
                  amountCents: 2000,
                  shopOrderId: null,
                  shopAdjustmentId: null,
                  purpose,
                },
              }
            : null,
      ),
    },
    accountingAccount: {
      findUnique: jest.fn(
        async ({ where }: { where: { clubId_code: { code: string } } }) => ({
          code: where.clubId_code.code,
          label: `Compte ${where.clubId_code.code}`,
          kind: where.clubId_code.code.startsWith('4') ? 'LIABILITY' : 'ASSET',
        }),
      ),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    allocation as never,
    {
      resolveAccountCode: jest.fn(async (_clubId: string, key: string) => {
        if (key === 'SHOP_PRODUCT') return '708000';
        if (key === 'MEMBERSHIP_PRODUCT') return '706100';
        return '512000';
      }),
    } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    { seedIfEmpty: jest.fn(async () => undefined) } as never,
    {
      resolveForPayment: jest.fn(async () => ({
        id: 'fa-caisse',
        accountingAccount: { code: '530000', label: 'Caisse' },
      })),
      getById: jest.fn(),
    } as never,
    {
      onEntryPosted: jest.fn(async () => null),
      refreshStatementStatus: jest.fn(async () => undefined),
    } as never,
  );

  return { svc, lines, entries, allocation };
}

describe('recordIncomeFromPayment — reçu d’avance', () => {
  it('est un TRANSFER : caisse au débit, 419100 au crédit, du montant versé', async () => {
    const h = harness(InvoicePurpose.PAYER_CREDIT_DEPOSIT);

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.entries.map((e) => e.kind)).toEqual([AccountingEntryKind.TRANSFER]);
    expect(h.lines).toEqual([
      expect.objectContaining({ accountCode: '530000', side: AccountingLineSide.DEBIT, debitCents: 2000, creditCents: 0 }),
      expect.objectContaining({ accountCode: '419100', side: AccountingLineSide.CREDIT, debitCents: 0, creditCents: 2000 }),
    ]);
  });

  it('ne ventile rien : une avance n’est encore la cotisation de personne', async () => {
    const h = harness(InvoicePurpose.PAYER_CREDIT_DEPOSIT);

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.allocation.buildAllocationsForInvoice).not.toHaveBeenCalled();
    expect(h.allocation.persistAllocationsForLine).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'club-1',
      [],
    );
  });

  it('une facture ordinaire reste une recette : INCOME, 706100 au crédit, ventilée', async () => {
    const h = harness(InvoicePurpose.CHARGE);

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.entries.map((e) => e.kind)).toEqual([AccountingEntryKind.INCOME]);
    expect(h.lines.find((l) => l.side === AccountingLineSide.CREDIT)?.accountCode).toBe('706100');
    expect(h.allocation.buildAllocationsForInvoice).toHaveBeenCalled();
  });
});
