import { NotFoundException } from '@nestjs/common';
import { AccountingMappingService } from './accounting-mapping.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AccountingMappingService', () => {
  const clubId = 'club-1';
  let mappings: Array<{
    id: string;
    clubId: string;
    sourceType: string;
    sourceId: string | null;
    accountId: string;
    accountCode: string;
  }>;
  let accounts: Array<{
    id: string;
    clubId: string;
    code: string;
    label: string;
  }>;
  let svc: AccountingMappingService;

  beforeEach(() => {
    mappings = [];
    accounts = [
      {
        id: 'acc-706',
        clubId,
        code: '706100',
        label: 'Cotisations',
      },
      {
        id: 'acc-606',
        clubId,
        code: '606800',
        label: 'Autres fournitures',
      },
      {
        id: 'acc-740',
        clubId,
        code: '740000',
        label: 'Subventions exploitation',
      },
    ];
    const prisma = {
      accountingAccount: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: { clubId_code: { clubId: string; code: string } };
          }) =>
            accounts.find(
              (a) =>
                a.clubId === where.clubId_code.clubId &&
                a.code === where.clubId_code.code,
            ) ?? null,
        ),
        findMany: jest.fn(
          async ({ where }: { where: { clubId: string } }) =>
            accounts.filter((a) => a.clubId === where.clubId),
        ),
      },
      accountingAccountMapping: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: {
              clubId_sourceType_sourceId: {
                clubId: string;
                sourceType: string;
                sourceId: string | null;
              };
            };
          }) =>
            mappings.find(
              (m) =>
                m.clubId === where.clubId_sourceType_sourceId.clubId &&
                m.sourceType === where.clubId_sourceType_sourceId.sourceType &&
                m.sourceId === where.clubId_sourceType_sourceId.sourceId,
            ) ?? null,
        ),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: {
              clubId: string;
              sourceType: string;
              sourceId: string | null;
            };
          }) =>
            mappings.find(
              (m) =>
                m.clubId === where.clubId &&
                m.sourceType === where.sourceType &&
                m.sourceId === where.sourceId,
            ) ?? null,
        ),
        findMany: jest.fn(async () => [...mappings]),
        create: jest.fn(async ({ data }: { data: typeof mappings[number] }) => {
          const row = { ...data, id: `m-${mappings.length}` };
          mappings.push(row);
          return row;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<typeof mappings[number]>;
          }) => {
            const m = mappings.find((x) => x.id === where.id);
            if (!m) throw new Error('Mapping inexistant');
            Object.assign(m, data);
            return m;
          },
        ),
      },
    } as unknown as PrismaService;
    svc = new AccountingMappingService(prisma);
  });

  describe('resolveAccountCode', () => {
    it('returns specific mapping when (sourceType, sourceId) match', async () => {
      mappings.push({
        id: 'm-0',
        clubId,
        sourceType: 'MEMBERSHIP_PRODUCT',
        sourceId: 'prod-42',
        accountId: 'acc-706',
        accountCode: '706100',
      });
      const code = await svc.resolveAccountCode(
        clubId,
        'MEMBERSHIP_PRODUCT',
        'prod-42',
      );
      expect(code).toBe('706100');
    });

    it('falls back to generic mapping when sourceId mapping not found', async () => {
      mappings.push({
        id: 'm-generic',
        clubId,
        sourceType: 'SUBSIDY',
        sourceId: null,
        accountId: 'acc-740',
        accountCode: '740000',
      });
      const code = await svc.resolveAccountCode(
        clubId,
        'SUBSIDY',
        'grant-999',
      );
      expect(code).toBe('740000');
    });

    it('falls back to hardcoded default when no mapping exists', async () => {
      const code = await svc.resolveAccountCode(clubId, 'MEMBERSHIP_PRODUCT');
      expect(code).toBe('706100');
    });

    it('uses EXPENSE_GENERIC fallback for unknown sourceType', async () => {
      const code = await svc.resolveAccountCode(clubId, 'UNKNOWN_SOURCE');
      expect(code).toBe('606800');
    });

    it('resolves Stripe fees to 627000', async () => {
      const code = await svc.resolveAccountCode(clubId, 'STRIPE_FEE');
      expect(code).toBe('627000');
    });
  });

  describe('resolveAccountWithLabel', () => {
    it('returns both code and label from the club plan', async () => {
      const r = await svc.resolveAccountWithLabel(
        clubId,
        'MEMBERSHIP_PRODUCT',
      );
      expect(r).toEqual({ code: '706100', label: 'Cotisations' });
    });

    it('returns "Compte XXX" when the account is not in the plan yet', async () => {
      // MEMBERSHIP_ONE_TIME_FEE default = 708000, pas dans la liste seed mock
      const r = await svc.resolveAccountWithLabel(
        clubId,
        'MEMBERSHIP_ONE_TIME_FEE',
      );
      expect(r.code).toBe('708000');
      expect(r.label).toBe('Compte 708000');
    });
  });

  describe('upsertMapping', () => {
    it('creates a new mapping when none exists', async () => {
      const r = await svc.upsertMapping(
        clubId,
        'MEMBERSHIP_PRODUCT',
        'prod-new',
        '706100',
      );
      expect(r.accountCode).toBe('706100');
      expect(mappings).toHaveLength(1);
    });

    it('updates existing mapping instead of creating a duplicate', async () => {
      await svc.upsertMapping(clubId, 'SUBSIDY', null, '740000');
      await svc.upsertMapping(clubId, 'SUBSIDY', null, '606800');
      expect(mappings).toHaveLength(1);
      expect(mappings[0].accountCode).toBe('606800');
    });

    it('throws NotFoundException when account does not exist in the plan', async () => {
      await expect(
        svc.upsertMapping(clubId, 'SUBSIDY', null, '999999'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
