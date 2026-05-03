import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClubFinancialAccountsService } from './club-financial-accounts.service';
import type { PrismaService } from '../prisma/prisma.service';

interface FakeFinAccount {
  id: string;
  clubId: string;
  kind: 'BANK' | 'CASH' | 'STRIPE_TRANSIT' | 'OTHER_TRANSIT';
  label: string;
  accountingAccountId: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  iban: string | null;
  bic: string | null;
  stripeAccountId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  accountingAccount: { id: string; code: string; label: string };
}
interface FakeRoute {
  id: string;
  clubId: string;
  method: 'STRIPE_CARD' | 'MANUAL_CASH' | 'MANUAL_CHECK' | 'MANUAL_TRANSFER';
  financialAccountId: string;
}
interface FakeAccount {
  id: string;
  clubId: string;
  code: string;
  label: string;
  kind: string;
}

/**
 * Tests unitaires de `resolveForPayment` (cascade de routage) +
 * validation kind ↔ code PCG sur la création.
 */
describe('ClubFinancialAccountsService', () => {
  const clubId = 'club-1';
  let finAccounts: FakeFinAccount[];
  let routes: FakeRoute[];
  let pcgAccounts: FakeAccount[];
  let svc: ClubFinancialAccountsService;

  function fakePrisma(): PrismaService {
    return {
      clubFinancialAccount: {
        findFirst: jest.fn(
          async (args: {
            where: Partial<FakeFinAccount> & { id?: string };
            include?: unknown;
            orderBy?: unknown;
          }) => {
            return (
              finAccounts.find((a) => {
                if (args.where.clubId && a.clubId !== args.where.clubId)
                  return false;
                if (args.where.id !== undefined && a.id !== args.where.id)
                  return false;
                if (args.where.kind !== undefined && a.kind !== args.where.kind)
                  return false;
                if (
                  args.where.isActive !== undefined &&
                  a.isActive !== args.where.isActive
                )
                  return false;
                if (
                  args.where.isDefault !== undefined &&
                  a.isDefault !== args.where.isDefault
                )
                  return false;
                if (
                  args.where.accountingAccountId !== undefined &&
                  a.accountingAccountId !== args.where.accountingAccountId
                )
                  return false;
                return true;
              }) ?? null
            );
          },
        ),
        findMany: jest.fn(async () => finAccounts),
        create: jest.fn(
          async (args: { data: Omit<FakeFinAccount, 'id' | 'createdAt' | 'updatedAt' | 'accountingAccount'>; include?: unknown }) => {
            const acc = pcgAccounts.find(
              (a) => a.id === args.data.accountingAccountId,
            );
            if (!acc) throw new Error('PCG manquant');
            const fa: FakeFinAccount = {
              id: `fa-${finAccounts.length + 1}`,
              clubId: args.data.clubId,
              kind: args.data.kind,
              label: args.data.label,
              accountingAccountId: args.data.accountingAccountId,
              iban: args.data.iban ?? null,
              bic: args.data.bic ?? null,
              stripeAccountId: args.data.stripeAccountId ?? null,
              isDefault: args.data.isDefault ?? false,
              isActive: args.data.isActive ?? true,
              sortOrder: args.data.sortOrder ?? 0,
              notes: args.data.notes ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
              accountingAccount: {
                id: acc.id,
                code: acc.code,
                label: acc.label,
              },
            };
            finAccounts.push(fa);
            return fa;
          },
        ),
        update: jest.fn(
          async (args: { where: { id: string }; data: Partial<FakeFinAccount> }) => {
            const fa = finAccounts.find((a) => a.id === args.where.id);
            if (!fa) throw new Error('not found');
            Object.assign(fa, args.data);
            return fa;
          },
        ),
        updateMany: jest.fn(
          async (args: {
            where: Partial<FakeFinAccount>;
            data: Partial<FakeFinAccount>;
          }) => {
            const matched = finAccounts.filter((a) => {
              if (a.clubId !== args.where.clubId) return false;
              if (
                args.where.kind !== undefined &&
                a.kind !== args.where.kind
              )
                return false;
              if (
                args.where.isDefault !== undefined &&
                a.isDefault !== args.where.isDefault
              )
                return false;
              return true;
            });
            for (const a of matched) Object.assign(a, args.data);
            return { count: matched.length };
          },
        ),
      },
      clubPaymentRoute: {
        findUnique: jest.fn(
          async (args: {
            where: { clubId_method: { clubId: string; method: string } };
            include?: unknown;
          }) => {
            const r = routes.find(
              (x) =>
                x.clubId === args.where.clubId_method.clubId &&
                x.method === args.where.clubId_method.method,
            );
            if (!r) return null;
            const fa = finAccounts.find((a) => a.id === r.financialAccountId);
            return fa ? { ...r, financialAccount: fa } : null;
          },
        ),
        count: jest.fn(async () => 0),
      },
      accountingAccount: {
        findFirst: jest.fn(
          async (args: { where: { clubId: string; id: string } }) =>
            pcgAccounts.find(
              (a) =>
                a.clubId === args.where.clubId && a.id === args.where.id,
            ) ?? null,
        ),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          clubFinancialAccount: {
            create: jest.fn(async (args: { data: unknown; include?: unknown }) =>
              ((this as unknown) as { clubFinancialAccount: { create: (a: unknown) => Promise<unknown> } }).clubFinancialAccount?.create(
                args,
              ),
            ),
            updateMany: jest.fn(),
            update: jest.fn(),
          },
        }),
      ),
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    pcgAccounts = [
      { id: 'a-512', clubId, code: '512000', label: 'Banque', kind: 'ASSET' },
      {
        id: 'a-512100',
        clubId,
        code: '512100',
        label: 'Crédit Agricole',
        kind: 'ASSET',
      },
      {
        id: 'a-512300',
        clubId,
        code: '512300',
        label: 'Stripe transit',
        kind: 'ASSET',
      },
      { id: 'a-530', clubId, code: '530000', label: 'Caisse', kind: 'ASSET' },
      {
        id: 'a-606',
        clubId,
        code: '606800',
        label: 'Autres fournitures',
        kind: 'EXPENSE',
      },
    ];
    finAccounts = [
      {
        id: 'fa-bank',
        clubId,
        kind: 'BANK',
        label: 'Banque principale',
        accountingAccountId: 'a-512',
        isDefault: true,
        isActive: true,
        sortOrder: 0,
        iban: null,
        bic: null,
        stripeAccountId: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accountingAccount: { id: 'a-512', code: '512000', label: 'Banque' },
      },
      {
        id: 'fa-cash',
        clubId,
        kind: 'CASH',
        label: 'Caisse principale',
        accountingAccountId: 'a-530',
        isDefault: true,
        isActive: true,
        sortOrder: 10,
        iban: null,
        bic: null,
        stripeAccountId: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        accountingAccount: { id: 'a-530', code: '530000', label: 'Caisse' },
      },
    ];
    routes = [
      {
        id: 'r-cash',
        clubId,
        method: 'MANUAL_CASH',
        financialAccountId: 'fa-cash',
      },
      {
        id: 'r-stripe',
        clubId,
        method: 'STRIPE_CARD',
        financialAccountId: 'fa-bank',
      },
    ];
    svc = new ClubFinancialAccountsService(fakePrisma());
  });

  describe('resolveForPayment', () => {
    it('utilise la route explicite si configurée', async () => {
      const fa = await svc.resolveForPayment(clubId, 'MANUAL_CASH');
      expect(fa.id).toBe('fa-cash');
      expect(fa.accountingAccount.code).toBe('530000');
    });

    it("fallback sur le default du kind si pas de route et compte par défaut existe", async () => {
      // Suppression de la route MANUAL_CASH
      routes = routes.filter((r) => r.method !== 'MANUAL_CASH');
      const fa = await svc.resolveForPayment(clubId, 'MANUAL_CASH');
      // Pas de route → cherche default CASH → fa-cash
      expect(fa.id).toBe('fa-cash');
    });

    it("STRIPE_CARD fallback sur BANK quand pas de STRIPE_TRANSIT configuré", async () => {
      // Suppression de la route STRIPE_CARD
      routes = routes.filter((r) => r.method !== 'STRIPE_CARD');
      // Et pas de compte STRIPE_TRANSIT existant — on a juste BANK et CASH
      const fa = await svc.resolveForPayment(clubId, 'STRIPE_CARD');
      // Default STRIPE_TRANSIT n'existe pas → fallback BANK
      expect(fa.kind).toBe('BANK');
    });

    it('throw si aucun compte configuré pour ce club', async () => {
      finAccounts = [];
      routes = [];
      await expect(svc.resolveForPayment(clubId, 'MANUAL_CASH')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('kindFromMethod', () => {
    it('mappe STRIPE_CARD → STRIPE_TRANSIT', () => {
      expect(svc.kindFromMethod('STRIPE_CARD')).toBe('STRIPE_TRANSIT');
    });
    it('mappe MANUAL_CASH → CASH', () => {
      expect(svc.kindFromMethod('MANUAL_CASH')).toBe('CASH');
    });
    it('mappe MANUAL_CHECK / MANUAL_TRANSFER → BANK', () => {
      expect(svc.kindFromMethod('MANUAL_CHECK')).toBe('BANK');
      expect(svc.kindFromMethod('MANUAL_TRANSFER')).toBe('BANK');
    });
  });

  describe('create', () => {
    it('refuse si AccountingAccount inexistant', async () => {
      await expect(
        svc.create(clubId, {
          kind: 'BANK',
          label: 'Test',
          accountingAccountId: 'inexistant',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuse si CASH lié à un code non-53x', async () => {
      await expect(
        svc.create(clubId, {
          kind: 'CASH',
          label: 'Faux caisse',
          accountingAccountId: 'a-512100', // code 512100 — incompatible CASH
        }),
      ).rejects.toThrow(/CASH.*53/);
    });

    it('refuse si BANK lié à un code non-51x', async () => {
      await expect(
        svc.create(clubId, {
          kind: 'BANK',
          label: 'Faux banque',
          accountingAccountId: 'a-606', // code 606800 — incompatible BANK
        }),
      ).rejects.toThrow(/BANK.*51/);
    });
  });
});
