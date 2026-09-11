import type { AccountingAllocationService } from './accounting-allocation.service';
import type { AccountingAuditService } from './accounting-audit.service';
import type { AccountingMappingService } from './accounting-mapping.service';
import type { AccountingPeriodService } from './accounting-period.service';
import type { AccountingSeedService } from './accounting-seed.service';
import type { AccountingSuggestionService } from './accounting-suggestion.service';
import { AccountingService } from './accounting.service';
import type { ClubFinancialAccountsService } from './club-financial-accounts.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * `createManualEntry` peut naître dans la transaction de l'appelant (chèque
 * hors facture, ADR-0015). Deux choses doivent alors être vraies, et la
 * seconde a manqué sur staging le 2026-09-10 :
 *
 *  1. le service n'ouvre PAS une seconde transaction ;
 *  2. le journal d'audit écrit DANS la transaction de l'appelant. Écrit à
 *     côté, il pointe vers une écriture encore invisible : clé étrangère
 *     violée (P2003), et toute la transaction de l'appelant annulée.
 */
function makeSvc() {
  const outerTx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'entry-1',
        ...data,
      })),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `line-${Math.random()}`,
        ...data,
      })),
    },
    accountingDocument: { create: jest.fn() },
  };
  const prisma = {
    accountingAccount: {
      findUnique: jest.fn(
        async ({ where }: { where: { clubId_code: { code: string } } }) => ({
          code: where.clubId_code.code,
          label: `Compte ${where.clubId_code.code}`,
          kind: where.clubId_code.code.startsWith('7') ? 'INCOME' : 'ASSET',
        }),
      ),
    },
    clubFinancialAccount: {
      findFirst: jest.fn(async () => ({
        id: 'fin-cheques',
        accountingAccount: { code: '511200', label: 'Chèques à encaisser' },
      })),
    },
    $transaction: jest.fn(async (fn: (tx: typeof outerTx) => Promise<unknown>) =>
      fn(outerTx),
    ),
  };
  const audit = {
    log: jest.fn((_params: unknown, _tx?: unknown) => Promise.resolve()),
  };
  const period = { assertDateIsOpen: jest.fn(async () => undefined) };
  const allocation = { persistAllocationsForLine: jest.fn(async () => undefined) };
  const financialAccounts = {
    getDefault: jest.fn(async () => ({
      id: 'fin-bank',
      accountingAccount: { code: '512000', label: 'Banque' },
    })),
  };
  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    allocation as unknown as AccountingAllocationService,
    {} as AccountingMappingService,
    period as unknown as AccountingPeriodService,
    audit as unknown as AccountingAuditService,
    {} as AccountingSuggestionService,
    {} as AccountingSeedService,
    financialAccounts as unknown as ClubFinancialAccountsService,
    // Rapprochement (lot 3) : ces tests ne passent aucune écriture en POSTED
    // depuis une proposition de relevé.
    {
      onEntryPosted: jest.fn(async () => null),
      refreshStatementStatus: jest.fn(async () => undefined),
    } as never,
  );
  return { svc, prisma, outerTx, audit };
}

const input = {
  kind: 'INCOME' as const,
  label: 'Chèque Mairie',
  accountCode: '754000',
  amountCents: 12_000,
  occurredOn: undefined,
  financialAccountId: 'fin-cheques',
  paymentMethod: 'CHECK',
  paymentReference: '1234567',
};

describe('AccountingService.createManualEntry — transaction de l’appelant', () => {
  it('avec une transaction externe : aucune transaction propre, et le journal d’audit écrit DANS celle de l’appelant', async () => {
    const { svc, prisma, outerTx, audit } = makeSvc();

    const created = await svc.createManualEntry('club-1', 'user-1', input, outerTx as never);

    expect(created.id).toBe('entry-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outerTx.accountingEntry.create).toHaveBeenCalledTimes(1);
    // Mode et référence de paiement persistés sur l'écriture, comme
    // ManualEntryInput le promet.
    expect(outerTx.accountingEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'CHECK',
        paymentReference: '1234567',
        financialAccountId: 'fin-cheques',
      }),
    });
    expect(outerTx.accountingEntryLine.create).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][1]).toBe(outerTx);
  });

  it('sans transaction externe : ouvre la sienne, et journalise une fois commitée', async () => {
    const { svc, prisma, audit } = makeSvc();

    await svc.createManualEntry('club-1', 'user-1', input);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][1]).toBeUndefined();
  });
});
