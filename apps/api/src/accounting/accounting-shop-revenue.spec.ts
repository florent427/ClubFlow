import { AccountingLineSide } from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Le compte de produit d'un encaissement dépend de ce qui est vendu.
 *
 * Le mapping `SHOP_PRODUCT -> 708000` était seedé depuis le début, mais aucun
 * chemin ne l'utilisait : tout encaissement de facture créditait 706100
 * « Cotisations », y compris une vente de kimono. Le trésorier ne pouvait pas
 * distinguer ses cotisations de ses ventes sans reclasser chaque ligne à la
 * main.
 */

type Line = {
  accountCode: string;
  side: AccountingLineSide;
  debitCents: number;
  creditCents: number;
};

function makeHarness(args: { shopOrderId: string | null; amountCents: number }) {
  const lines: Line[] = [];

  const tx = {
    accountingEntry: {
      create: jest.fn(async () => ({ id: 'entry-1' })),
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
    // Idempotence : aucune écriture préexistante pour ce paiement.
    accountingEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    payment: {
      // Applique le `where` : un double qui rendrait le paiement quel que
      // soit le club laisserait passer une fuite entre clubs.
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; clubId: string } }) =>
          where.id === 'pay-1' && where.clubId === 'club-1'
            ? {
                id: 'pay-1',
                clubId: 'club-1',
                method: 'MANUAL_CHECK',
                amountCents: args.amountCents,
                createdAt: new Date('2026-09-12T00:00:00Z'),
                financialAccountId: null,
                invoice: {
                  id: 'inv-1',
                  label: 'Facture',
                  amountCents: args.amountCents,
                  shopOrderId: args.shopOrderId,
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
          kind: 'ASSET',
        }),
      ),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    {
      buildAllocationsForInvoice: jest.fn(async () => []),
      persistAllocationsForLine: jest.fn(async () => undefined),
    } as never,
    {
      // Mapping fidèle : chaque source a SON compte. Un mapping qui
      // retournerait 706100 pour tout rendrait le test aveugle au bug.
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
        id: 'fa-bank',
        accountingAccount: { code: '512000', label: 'Banque' },
      })),
      getById: jest.fn(async () => ({
        id: 'fa-bank',
        accountingAccount: { code: '512000', label: 'Banque' },
      })),
    } as never,
    {
      onEntryPosted: jest.fn(async () => null),
      refreshStatementStatus: jest.fn(async () => undefined),
    } as never,
  );

  const creditedCode = () =>
    lines.find((l) => l.side === AccountingLineSide.CREDIT)?.accountCode;

  return { svc, lines, creditedCode };
}

describe('recordIncomeFromPayment — compte de produit', () => {
  it('crédite le compte de ventes pour une commande boutique', async () => {
    const h = makeHarness({ shopOrderId: 'order-1', amountCents: 2500 });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.creditedCode()).toBe('708000');
  });

  it('crédite les cotisations pour une facture d’adhésion', async () => {
    const h = makeHarness({ shopOrderId: null, amountCents: 9000 });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    expect(h.creditedCode()).toBe('706100');
  });

  it('laisse la trésorerie au débit dans les deux cas', async () => {
    const boutique = makeHarness({ shopOrderId: 'order-1', amountCents: 2500 });
    await boutique.svc.recordIncomeFromPayment('club-1', 'pay-1');
    const adhesion = makeHarness({ shopOrderId: null, amountCents: 9000 });
    await adhesion.svc.recordIncomeFromPayment('club-1', 'pay-1');

    for (const h of [boutique, adhesion]) {
      const debit = h.lines.find((l) => l.side === AccountingLineSide.DEBIT);
      expect(debit?.accountCode).toBe('512000');
    }
  });

  it('équilibre l’écriture sur le montant encaissé', async () => {
    const h = makeHarness({ shopOrderId: 'order-1', amountCents: 2500 });

    await h.svc.recordIncomeFromPayment('club-1', 'pay-1');

    const debits = h.lines.reduce((s, l) => s + l.debitCents, 0);
    const credits = h.lines.reduce((s, l) => s + l.creditCents, 0);
    expect(debits).toBe(2500);
    expect(credits).toBe(2500);
  });
});
