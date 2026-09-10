import { BadRequestException } from '@nestjs/common';
import { parseIsoDate } from '../accounting/accounting-fiscal-year.service';
import type { AccountingSeedService } from '../accounting/accounting-seed.service';
import type { AccountingService } from '../accounting/accounting.service';
import type { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import type { GrantsService } from '../external-finance/grants.service';
import type { SponsoringService } from '../external-finance/sponsoring.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ChequesService } from './cheques.service';

const CLUB = 'club-1';
const TRANSIT = { id: 'fin-cheques', kind: 'CHEQUE_TRANSIT', accountingAccount: { code: '511200' } };

function makeSvc() {
  const cheques: Array<Record<string, unknown>> = [];
  // Le client de transaction est le même objet, transmis au callback :
  // le test vérifie que `createManualEntry` le reçoit.
  const txClient = {
    cheque: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: 'chq-1', payment: null, deposit: null, image: null };
        cheques.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        cheques.find((c) => c.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = cheques.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
    },
    accountingAccount: {
      findFirst: jest.fn(async ({ where }: { where: { code: string } }) =>
        where.code === '754000'
          ? { code: '754000', kind: 'INCOME' }
          : where.code === '606300'
            ? { code: '606300', kind: 'EXPENSE' }
            : null,
      ),
    },
    mediaAsset: { findFirst: jest.fn(async () => ({ kind: 'IMAGE' })) },
  };
  const prisma = {
    ...txClient,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient),
    ),
  };
  const accounting = {
    createManualEntry: jest.fn(async () => ({ id: 'entry-1' })),
    createContraEntry: jest.fn(async () => ({ id: 'contra-1' })),
  };
  const financialAccounts = {
    getDefault: jest.fn(async (_c: string, kind: string) => (kind === 'CHEQUE_TRANSIT' ? TRANSIT : null)),
  };
  const seed = { seedIfEmpty: jest.fn(async () => ({})) };
  const grants = { markInstallmentReceived: jest.fn(async () => ({})) };
  const sponsoring = { markInstallmentReceived: jest.fn(async () => ({})) };
  const svc = new ChequesService(
    prisma as unknown as PrismaService,
    accounting as unknown as AccountingService,
    financialAccounts as unknown as ClubFinancialAccountsService,
    seed as unknown as AccountingSeedService,
    grants as unknown as GrantsService,
    sponsoring as unknown as SponsoringService,
  );
  return { svc, prisma, txClient, accounting, grants, sponsoring, cheques };
}

describe('ChequesService.createStandalone', () => {
  const base = {
    drawerName: ' Mairie ',
    amountCents: 25_000,
    receivedOn: parseIsoDate('2026-09-03'),
    accountCode: '754000',
  };

  it('crée la recette avec 511200 en contrepartie, mode CHECK, puis le chèque en portefeuille — dans la même transaction', async () => {
    const { svc, prisma, txClient, accounting, cheques } = makeSvc();

    const out = await svc.createStandalone(CLUB, 'user-1', { ...base, number: ' 1234567 ' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(accounting.createManualEntry).toHaveBeenCalledWith(
      CLUB,
      'user-1',
      expect.objectContaining({
        kind: 'INCOME',
        accountCode: '754000',
        amountCents: 25_000,
        occurredAt: base.receivedOn,
        financialAccountId: TRANSIT.id,
        paymentMethod: 'CHECK',
        paymentReference: '1234567',
        label: 'Chèque Mairie',
      }),
      txClient, // le client de transaction est transmis, pas `prisma`
    );
    expect(out.entryId).toBe('entry-1');
    expect(out.status).toBe('PENDING');
    expect(out.drawerName).toBe('Mairie');
    expect(cheques).toHaveLength(1);
  });

  it('refuse un compte de charge, deux tranches à la fois, un montant nul', async () => {
    const { svc, accounting } = makeSvc();
    await expect(svc.createStandalone(CLUB, 'u', { ...base, accountCode: '606300' })).rejects.toThrow(BadRequestException);
    await expect(
      svc.createStandalone(CLUB, 'u', { ...base, grantInstallmentId: 'g', sponsorshipInstallmentId: 's' }),
    ).rejects.toThrow(BadRequestException);
    await expect(svc.createStandalone(CLUB, 'u', { ...base, amountCents: 0 })).rejects.toThrow(BadRequestException);
    expect(accounting.createManualEntry).not.toHaveBeenCalled();
  });

  it('rattache la tranche de subvention à l’écriture existante, sans en créer une seconde', async () => {
    const { svc, grants, sponsoring } = makeSvc();
    await svc.createStandalone(CLUB, 'u', { ...base, grantInstallmentId: 'inst-1' });
    expect(grants.markInstallmentReceived).toHaveBeenCalledWith(CLUB, 'u', 'inst-1', {
      receivedAmountCents: 25_000,
      receivedAt: base.receivedOn,
      accountingEntryId: 'entry-1',
    });
    expect(sponsoring.markInstallmentReceived).not.toHaveBeenCalled();
  });
});

describe('ChequesService.cancelStandalone', () => {
  it('contre-passe la recette et passe le chèque CANCELLED', async () => {
    const { svc, accounting, cheques } = makeSvc();
    await svc.createStandalone(CLUB, 'u', {
      drawerName: 'Sponsor',
      amountCents: 1000,
      receivedOn: parseIsoDate('2026-09-03'),
      accountCode: '754000',
    });
    const out = await svc.cancelStandalone(CLUB, 'u', 'chq-1', 'doublon');
    expect(accounting.createContraEntry).toHaveBeenCalledWith(CLUB, 'u', 'entry-1', 'doublon');
    expect(out.status).toBe('CANCELLED');
    expect(cheques[0].status).toBe('CANCELLED');
  });

  it('refuse un chèque de facture : il passe par un remboursement ou un avoir', async () => {
    const { svc, cheques, accounting } = makeSvc();
    cheques.push({ id: 'chq-1', clubId: CLUB, status: 'PENDING', paymentId: 'pay-1', entryId: null, notes: null });
    await expect(svc.cancelStandalone(CLUB, 'u', 'chq-1', 'x')).rejects.toThrow(BadRequestException);
    expect(accounting.createContraEntry).not.toHaveBeenCalled();
  });
});
