import {
  AccountingEntryKind,
  AccountingLineSide,
  ClubPaymentMethod,
  InvoicePurpose,
} from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Crédit utilisé (ADR-0022, §5) : la recette est constatée au jour de
 * l'imputation, contre 419100 où l'avance attendait. Aucun argent n'entre :
 * aucun compte financier, donc hors trésorerie et hors rapprochement. Le crédit
 * rendu revient sur 419100, jamais sur la banque.
 */

type Line = {
  accountCode: string;
  side: AccountingLineSide;
  debitCents: number;
  creditCents: number;
};

function recette(opts: {
  method: ClubPaymentMethod;
  amountCents: number;
  invoiceAmountCents: number;
  boutique?: boolean;
}) {
  const lines: Line[] = [];
  const entries: Array<Record<string, unknown>> = [];
  const ventilations: Array<Array<{ amountCents: number }>> = [];
  const allocation = {
    buildAllocationsForInvoice: jest.fn(async () => [
      { amountCents: 3000, memberId: 'm-1' },
      { amountCents: 2000, memberId: 'm-2' },
    ]),
    persistAllocationsForLine: jest.fn(
      async (_tx: unknown, _lineId: string, _clubId: string, rows: Array<{ amountCents: number }>) => {
        ventilations.push(rows.map((r) => ({ ...r })));
      },
    ),
  };
  const tx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
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
      findFirst: jest.fn(async ({ where }: { where: { id: string; clubId: string } }) =>
        where.id === 'pay-1' && where.clubId === 'club-1'
          ? {
              id: 'pay-1',
              clubId: 'club-1',
              method: opts.method,
              amountCents: opts.amountCents,
              createdAt: new Date('2026-09-20T00:00:00Z'),
              financialAccountId: null,
              invoice: {
                id: 'inv-1',
                label: 'Cotisation 2026',
                amountCents: opts.invoiceAmountCents,
                shopOrderId: opts.boutique ? 'so-1' : null,
                shopAdjustmentId: null,
                purpose: InvoicePurpose.CHARGE,
              },
            }
          : null,
      ),
    },
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_code: { code: string } } }) => ({
        code: where.clubId_code.code,
        label: `Compte ${where.clubId_code.code}`,
        kind: where.clubId_code.code.startsWith('4') ? 'LIABILITY' : 'ASSET',
      })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const financialAccounts = {
    resolveForPayment: jest.fn(async () => ({
      id: 'fa-caisse',
      accountingAccount: { code: '530000', label: 'Caisse' },
    })),
    getById: jest.fn(),
  };
  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    allocation as never,
    {
      resolveAccountCode: jest.fn(async (_clubId: string, key: string) =>
        key === 'SHOP_PRODUCT' ? '708000' : key === 'MEMBERSHIP_PRODUCT' ? '706100' : '512000',
      ),
    } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    { seedIfEmpty: jest.fn(async () => undefined) } as never,
    financialAccounts as never,
    {
      onEntryPosted: jest.fn(async () => null),
      refreshStatementStatus: jest.fn(async () => undefined),
    } as never,
  );
  return { svc, lines, entries, ventilations, financialAccounts, tx };
}

describe('recordIncomeFromPayment — crédit utilisé (ADR-0022, §5)', () => {
  it('une recette contre 419100, sans compte financier ni routage', async () => {
    const h = recette({ method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 5000, invoiceAmountCents: 5000 });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1', 'Crédit — Cotisation 2026', 5000, null);

    expect(h.entries).toEqual([
      expect.objectContaining({ kind: AccountingEntryKind.INCOME, financialAccountId: null }),
    ]);
    expect(h.lines).toEqual([
      expect.objectContaining({ accountCode: '419100', side: AccountingLineSide.DEBIT, debitCents: 5000 }),
      expect.objectContaining({ accountCode: '706100', side: AccountingLineSide.CREDIT, creditCents: 5000 }),
    ]);
    expect(h.financialAccounts.resolveForPayment).not.toHaveBeenCalled();
    expect(h.tx.payment.update).not.toHaveBeenCalled();
  });

  it('une vente boutique réglée par crédit crédite les ventes', async () => {
    const h = recette({ method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 2500, invoiceAmountCents: 2500, boutique: true });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.lines.find((l) => l.side === AccountingLineSide.CREDIT)?.accountCode).toBe('708000');
  });

  it('une imputation partielle ventile le montant imputé', async () => {
    const h = recette({ method: ClubPaymentMethod.PAYER_CREDIT, amountCents: 2000, invoiceAmountCents: 5000 });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.ventilations).toEqual([[
      expect.objectContaining({ amountCents: 1200 }),
      expect.objectContaining({ amountCents: 800 }),
    ]]);
  });

  it('témoin : un encaissement en espèces garde sa caisse et son compte financier', async () => {
    const h = recette({ method: ClubPaymentMethod.MANUAL_CASH, amountCents: 5000, invoiceAmountCents: 5000 });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.lines[0]).toMatchObject({ accountCode: '530000', side: AccountingLineSide.DEBIT });
    expect(h.entries[0]).toMatchObject({ financialAccountId: 'fa-caisse' });
  });
});

type Recette = {
  id: string;
  paymentId: string;
  method: ClubPaymentMethod;
  compteFinancier: string | null;
  debit: string;
  credit: string;
  createdAt: Date;
};

function contrePassation(opts: { avoirCents: number; recettes: Recette[] }) {
  const lines: Line[] = [];
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'contra-1' };
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Line }) => {
        lines.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    clubModule: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
    invoice: {
      findFirst: jest.fn(async () => ({
        id: 'cn-1',
        clubId: 'club-1',
        isCreditNote: true,
        parentInvoiceId: 'inv-1',
        amountCents: opts.avoirCents,
        label: 'Avoir — Cotisation 2026',
        createdAt: new Date('2026-09-21T00:00:00Z'),
      })),
    },
    accountingEntry: {
      // Le `where` comme Prisma : la clause absente ne filtre rien, la clause
      // inconnue lève.
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        for (const cle of Object.keys(where)) {
          if (!['clubId', 'paymentId', 'payment', 'source', 'cancelledAt'].includes(cle)) {
            throw new Error(`Clause non simulée : ${cle}`);
          }
        }
        const paiement = where.payment as
          | { invoiceId?: string; method?: { not: ClubPaymentMethod } }
          | undefined;
        for (const cle of Object.keys(paiement ?? {})) {
          if (!['invoiceId', 'method'].includes(cle)) throw new Error(`Clause non simulée : payment.${cle}`);
        }
        const retenue = opts.recettes
          .filter((r) => where.paymentId === undefined || r.paymentId === where.paymentId)
          .filter((r) => paiement?.invoiceId === undefined || paiement.invoiceId === 'inv-1')
          .filter((r) => paiement?.method === undefined || r.method !== paiement.method.not)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        if (!retenue) return null;
        return {
          id: retenue.id,
          financialAccountId: retenue.compteFinancier ? `fa-${retenue.compteFinancier}` : null,
          lines: [
            { accountCode: retenue.debit, side: AccountingLineSide.DEBIT, debitCents: 1, creditCents: 0 },
            { accountCode: retenue.credit, side: AccountingLineSide.CREDIT, debitCents: 0, creditCents: 1 },
          ],
          financialAccount: retenue.compteFinancier
            ? { accountingAccount: { code: retenue.compteFinancier, label: retenue.compteFinancier } }
            : null,
        };
      }),
    },
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_code: { code: string } } }) => ({
        code: where.clubId_code.code,
        label: `Compte ${where.clubId_code.code}`,
        kind: 'ASSET',
      })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    {} as never,
    {
      resolveAccountCode: jest.fn(async (_c: string, key: string) =>
        key === 'BANK_ACCOUNT' ? '512000' : '706100',
      ),
    } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    { getById: jest.fn() } as never,
    { matchExistingLineForEntry: jest.fn(async () => null) } as never,
  );
  return { svc, lines, created };
}

const imputation: Recette = {
  id: 'entry-credit',
  paymentId: 'pay-credit',
  method: ClubPaymentMethod.PAYER_CREDIT,
  compteFinancier: null,
  debit: '419100',
  credit: '706100',
  createdAt: new Date('2026-09-20T00:00:00Z'),
};
const especes: Recette = {
  id: 'entry-cash',
  paymentId: 'pay-cash',
  method: ClubPaymentMethod.MANUAL_CASH,
  compteFinancier: '530000',
  debit: '530000',
  credit: '706100',
  createdAt: new Date('2026-09-10T00:00:00Z'),
};

describe('createContraEntryForCreditNote — crédit rendu (ADR-0022, §5)', () => {
  it('le crédit rendu revient sur 419100, sans compte financier', async () => {
    const h = contrePassation({ avoirCents: 3000, recettes: [imputation] });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1', 'pay-credit', null, 3000);

    expect(h.lines).toEqual([
      expect.objectContaining({ accountCode: '706100', side: AccountingLineSide.DEBIT, debitCents: 3000 }),
      expect.objectContaining({ accountCode: '419100', side: AccountingLineSide.CREDIT, creditCents: 3000 }),
    ]);
    expect(h.created[0]).toMatchObject({ financialAccountId: null });
  });

  it('sans encaissement désigné, un avoir ne contre-passe jamais une imputation de crédit', async () => {
    // L'imputation est la plus récente : la retenir rendrait au crédit ce qui
    // a été payé en espèces.
    const h = contrePassation({ avoirCents: 2000, recettes: [especes, imputation] });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.lines.find((l) => l.side === AccountingLineSide.CREDIT)?.accountCode).toBe('530000');
  });

  it('seule la part désignée de l’avoir est contre-passée', async () => {
    const h = contrePassation({ avoirCents: 5000, recettes: [imputation] });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1', 'pay-credit', null, 1200);

    expect(h.lines.map((l) => l.debitCents + l.creditCents)).toEqual([1200, 1200]);
  });
});
