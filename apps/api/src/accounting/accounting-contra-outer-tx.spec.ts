import { AccountingEntrySource, AccountingLineSide } from '@prisma/client';
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
 * L'annulation d'un encaissement contre-passe sa recette DANS sa propre
 * transaction : l'une ne va pas sans l'autre. Même règle que
 * `createManualEntry` (accounting-manual-entry-outer-tx.spec.ts) : pas de
 * seconde transaction, et le journal d'audit dans celle de l'appelant.
 */
function makeSvc(source: Record<string, unknown> | null) {
  const client = () => ({
    accountingEntry: {
      findFirst: jest.fn(async () => source),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'contra-1',
        ...data,
      })),
      update: jest.fn(async () => ({})),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
  });
  const outerTx = client();
  const own = client();
  const prisma = {
    ...client(),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(own)),
  };
  const audit = {
    log: jest.fn((_params: unknown, _tx?: unknown) => Promise.resolve()),
  };
  const period = { assertDateIsOpen: jest.fn(async () => undefined) };
  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    {} as AccountingAllocationService,
    {} as AccountingMappingService,
    period as unknown as AccountingPeriodService,
    audit as unknown as AccountingAuditService,
    {} as AccountingSuggestionService,
    {} as AccountingSeedService,
    {} as ClubFinancialAccountsService,
    {} as never,
  );
  return { svc, prisma, outerTx, own, audit, period };
}

const RECETTE = {
  id: 'ecr-366',
  clubId: 'club-1',
  kind: 'INCOME',
  label: 'Encaissement Adhésion',
  amountCents: 36600,
  contraEntryId: null,
  lines: [
    {
      accountCode: '511200',
      accountLabel: 'Chèques à encaisser',
      side: AccountingLineSide.DEBIT,
      debitCents: 36600,
      creditCents: 0,
      sortOrder: 0,
    },
    {
      accountCode: '706100',
      accountLabel: 'Cotisations',
      side: AccountingLineSide.CREDIT,
      debitCents: 0,
      creditCents: 36600,
      sortOrder: 1,
    },
  ],
};

describe('AccountingService.createContraEntry — transaction de l’appelant', () => {
  it('lit, écrit et journalise dans la transaction de l’appelant, sans en ouvrir une', async () => {
    const { svc, prisma, outerTx, audit } = makeSvc(RECETTE);

    await svc.createContraEntry('club-1', 'user-1', 'ecr-366', 'Saisie fausse', outerTx as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(outerTx.accountingEntry.findFirst).toHaveBeenCalledTimes(1);
    expect(outerTx.accountingEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contraEntryId: 'ecr-366',
        amountCents: 36600,
        source: AccountingEntrySource.AUTO_REFUND,
      }),
    });
    // Les lignes inversées : ce qui était au débit passe au crédit.
    expect(outerTx.accountingEntryLine.create.mock.calls.map((c) => c[0].data)).toEqual([
      expect.objectContaining({ accountCode: '511200', debitCents: 0, creditCents: 36600 }),
      expect.objectContaining({ accountCode: '706100', debitCents: 36600, creditCents: 0 }),
    ]);
    expect(outerTx.accountingEntry.update).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][1]).toBe(outerTx);
  });

  it('sans transaction de l’appelant : ouvre la sienne, comme avant', async () => {
    const { svc, prisma, own, audit } = makeSvc(RECETTE);

    await svc.createContraEntry('club-1', 'user-1', 'ecr-366', 'Chèque perdu');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(own.accountingEntry.create).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][1]).toBeUndefined();
  });

  it('une recette déjà contre-passée est refusée avant toute écriture', async () => {
    const { svc, outerTx } = makeSvc({ ...RECETTE, contraEntryId: 'contra-0' });

    await expect(
      svc.createContraEntry('club-1', 'user-1', 'ecr-366', 'Deux fois', outerTx as never),
    ).rejects.toThrow('Cette écriture a déjà été contre-passée.');
    expect(outerTx.accountingEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.paymentIncomeEntryState', () => {
  const etat = async (entry: Record<string, unknown> | null) => {
    const { svc, prisma } = makeSvc(null);
    prisma.accountingEntry.findFirst.mockResolvedValue(entry as never);
    const res = await svc.paymentIncomeEntryState('club-1', 'pay-1');
    return { res, where: prisma.accountingEntry.findFirst.mock.calls[0] };
  };
  const libre = { id: 'ecr-1', lockedAt: null, consolidatedAt: null, lines: [{ bankReconciledAt: null }] };

  it('cherche la recette encore active de CET encaissement', async () => {
    const { where } = await etat(libre);
    expect(where).toEqual([
      expect.objectContaining({
        where: {
          clubId: 'club-1',
          paymentId: 'pay-1',
          source: AccountingEntrySource.AUTO_MEMBER_PAYMENT,
          cancelledAt: null,
        },
      }),
    ]);
  });

  it('libre : rien ne s’oppose à la contre-passation', async () => {
    expect((await etat(libre)).res).toEqual({ entryId: 'ecr-1', blockedBecause: null });
  });

  it('aucune recette : null', async () => {
    expect((await etat(null)).res).toBeNull();
  });

  it('verrouillée ou consolidée : bloquée', async () => {
    for (const e of [
      { ...libre, lockedAt: new Date() },
      { ...libre, consolidatedAt: new Date() },
    ]) {
      expect((await etat(e)).res?.blockedBecause).toBe(
        'La recette de cet encaissement est verrouillée en comptabilité : il ne s’annule plus ici. Corrige-la par une contre-passation datée d’un mois ouvert.',
      );
    }
  });

  it('rapprochée d’un relevé : bloquée', async () => {
    const { res } = await etat({
      ...libre,
      lines: [{ bankReconciledAt: null }, { bankReconciledAt: new Date() }],
    });
    expect(res?.blockedBecause).toBe(
      'Cet encaissement est rapproché d’une ligne de relevé bancaire : défais d’abord le rapprochement.',
    );
  });
});
