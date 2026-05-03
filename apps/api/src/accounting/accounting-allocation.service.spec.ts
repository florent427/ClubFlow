import { AccountingAllocationService } from './accounting-allocation.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AccountingAllocationService', () => {
  const clubId = 'club-1';
  let members: Array<{
    id: string;
    birthDate: Date | null;
    gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
  }>;
  let cohorts: Array<{
    id: string;
    clubId: string;
    code: string;
    label: string;
    minAge: number | null;
    maxAge: number | null;
    sortOrder: number;
    isDefault: boolean;
  }>;
  let memberGroups: Array<{
    id: string;
    memberId: string;
    dynamicGroupId: string;
    dynamicGroup: { id: string; name: string };
  }>;
  let invoices: Array<{
    id: string;
    amountCents: number;
    lines: Array<{
      id: string;
      memberId: string | null;
      baseAmountCents: number;
      membershipProduct: { disciplineCode: string | null } | null;
      adjustments: Array<{ amountCents: number }>;
    }>;
  }>;
  let svc: AccountingAllocationService;

  beforeEach(() => {
    members = [
      // Enfant 8 ans → ENFANT
      {
        id: 'lea',
        birthDate: new Date('2018-01-15'),
        gender: 'FEMALE',
      },
      // Ado 14 ans → ADO
      {
        id: 'tom',
        birthDate: new Date('2012-04-10'),
        gender: 'MALE',
      },
      // Adulte
      {
        id: 'marc',
        birthDate: new Date('1990-06-01'),
        gender: 'MALE',
      },
      // Sans birthDate
      {
        id: 'mystery',
        birthDate: null,
        gender: 'UNSPECIFIED',
      },
    ];
    cohorts = [
      {
        id: 'c-baby',
        clubId,
        code: 'BABY',
        label: 'Baby',
        minAge: 0,
        maxAge: 5,
        sortOrder: 1,
        isDefault: true,
      },
      {
        id: 'c-enfant',
        clubId,
        code: 'ENFANT',
        label: 'Enfant',
        minAge: 6,
        maxAge: 11,
        sortOrder: 2,
        isDefault: true,
      },
      {
        id: 'c-ado',
        clubId,
        code: 'ADO',
        label: 'Ado',
        minAge: 12,
        maxAge: 17,
        sortOrder: 3,
        isDefault: true,
      },
      {
        id: 'c-adulte',
        clubId,
        code: 'ADULTE',
        label: 'Adulte',
        minAge: 18,
        maxAge: 59,
        sortOrder: 4,
        isDefault: true,
      },
      {
        id: 'c-senior',
        clubId,
        code: 'SENIOR',
        label: 'Senior',
        minAge: 60,
        maxAge: null,
        sortOrder: 5,
        isDefault: true,
      },
    ];
    memberGroups = [];
    invoices = [];

    const prisma = {
      member: {
        findUnique: jest.fn(
          async ({
            where,
            select: _select,
          }: {
            where: { id: string };
            select?: unknown;
          }) => members.find((m) => m.id === where.id) ?? null,
        ),
      },
      accountingCohort: {
        findMany: jest.fn(
          async ({ where }: { where: { clubId: string } }) =>
            cohorts
              .filter((c) => c.clubId === where.clubId)
              .sort((a, b) => a.sortOrder - b.sortOrder),
        ),
      },
      memberDynamicGroup: {
        findMany: jest.fn(
          async ({ where }: { where: { memberId: string } }) =>
            memberGroups
              .filter((g) => g.memberId === where.memberId)
              .map((g) => ({ ...g })),
        ),
      },
      invoice: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: { id: string };
          }) => invoices.find((i) => i.id === where.id) ?? null,
        ),
      },
    } as unknown as PrismaService;
    svc = new AccountingAllocationService(prisma);
  });

  describe('resolveCohortCode', () => {
    it('returns ENFANT for a 8-year-old member', async () => {
      const code = await svc.resolveCohortCode(
        clubId,
        'lea',
        new Date('2026-06-01'),
      );
      expect(code).toBe('ENFANT');
    });

    it('returns ADO for a 14-year-old member', async () => {
      const code = await svc.resolveCohortCode(
        clubId,
        'tom',
        new Date('2026-06-01'),
      );
      expect(code).toBe('ADO');
    });

    it('returns ADULTE for a 36-year-old member', async () => {
      const code = await svc.resolveCohortCode(
        clubId,
        'marc',
        new Date('2026-06-01'),
      );
      expect(code).toBe('ADULTE');
    });

    it('returns SENIOR when no maxAge configured (60+)', async () => {
      members.push({
        id: 'rene',
        birthDate: new Date('1960-01-01'),
        gender: 'MALE',
      });
      const code = await svc.resolveCohortCode(
        clubId,
        'rene',
        new Date('2026-06-01'),
      );
      expect(code).toBe('SENIOR');
    });

    it('returns null when birthDate is missing', async () => {
      const code = await svc.resolveCohortCode(
        clubId,
        'mystery',
        new Date('2026-06-01'),
      );
      expect(code).toBeNull();
    });

    it('handles age boundary exactly (12 years old → ADO, not ENFANT)', async () => {
      members.push({
        id: 'borderline',
        birthDate: new Date('2014-06-01'), // 12 ans pile le 2026-06-01
        gender: 'FEMALE',
      });
      const code = await svc.resolveCohortCode(
        clubId,
        'borderline',
        new Date('2026-06-01'),
      );
      expect(code).toBe('ADO');
    });
  });

  describe('resolveGender', () => {
    it('returns the gender from the Member record', async () => {
      expect(await svc.resolveGender('lea')).toBe('FEMALE');
      expect(await svc.resolveGender('tom')).toBe('MALE');
    });

    it('returns null for unknown member', async () => {
      expect(await svc.resolveGender('ghost')).toBeNull();
    });
  });

  describe('snapshotDynamicGroups', () => {
    it('returns an empty array when member is in no group', async () => {
      expect(await svc.snapshotDynamicGroups('lea')).toEqual([]);
    });

    it('returns the groups with labels', async () => {
      memberGroups.push(
        {
          id: 'mg-1',
          memberId: 'lea',
          dynamicGroupId: 'g-1',
          dynamicGroup: { id: 'g-1', name: 'Compétiteurs 2026' },
        },
        {
          id: 'mg-2',
          memberId: 'lea',
          dynamicGroupId: 'g-2',
          dynamicGroup: { id: 'g-2', name: 'Enfants karaté' },
        },
      );
      const snapshot = await svc.snapshotDynamicGroups('lea');
      expect(snapshot).toEqual([
        { groupId: 'g-1', groupLabel: 'Compétiteurs 2026' },
        { groupId: 'g-2', groupLabel: 'Enfants karaté' },
      ]);
    });
  });

  describe('buildAllocationsForInvoice', () => {
    const occurredAt = new Date('2026-06-01');

    it('returns an empty array when invoice does not exist', async () => {
      const alloc = await svc.buildAllocationsForInvoice(
        clubId,
        'bad-id',
        occurredAt,
      );
      expect(alloc).toEqual([]);
    });

    it('creates one allocation per invoice line, ventilated by member', async () => {
      invoices.push({
        id: 'inv-family',
        amountCents: 30000,
        lines: [
          {
            id: 'l1',
            memberId: 'lea',
            baseAmountCents: 15000,
            membershipProduct: { disciplineCode: 'karate' },
            adjustments: [],
          },
          {
            id: 'l2',
            memberId: 'tom',
            baseAmountCents: 15000,
            membershipProduct: { disciplineCode: 'judo' },
            adjustments: [],
          },
        ],
      });
      const allocs = await svc.buildAllocationsForInvoice(
        clubId,
        'inv-family',
        occurredAt,
      );
      expect(allocs).toHaveLength(2);
      expect(allocs[0]).toMatchObject({
        amountCents: 15000,
        memberId: 'lea',
        cohortCode: 'ENFANT',
        gender: 'FEMALE',
        disciplineCode: 'karate',
      });
      expect(allocs[1]).toMatchObject({
        amountCents: 15000,
        memberId: 'tom',
        cohortCode: 'ADO',
        gender: 'MALE',
        disciplineCode: 'judo',
      });
    });

    it('applies adjustments to the line amount', async () => {
      invoices.push({
        id: 'inv-reduc',
        amountCents: 13000,
        lines: [
          {
            id: 'l1',
            memberId: 'lea',
            baseAmountCents: 15000,
            membershipProduct: { disciplineCode: 'karate' },
            adjustments: [{ amountCents: -2000 }], // remise famille
          },
        ],
      });
      const allocs = await svc.buildAllocationsForInvoice(
        clubId,
        'inv-reduc',
        occurredAt,
      );
      expect(allocs).toHaveLength(1);
      expect(allocs[0].amountCents).toBe(13000);
    });

    it('absorbs arithmetic drift on the first allocation', async () => {
      invoices.push({
        id: 'inv-drift',
        amountCents: 14999, // dénormalisé différent du calcul base-adj
        lines: [
          {
            id: 'l1',
            memberId: 'lea',
            baseAmountCents: 15000,
            membershipProduct: null,
            adjustments: [],
          },
        ],
      });
      const allocs = await svc.buildAllocationsForInvoice(
        clubId,
        'inv-drift',
        occurredAt,
      );
      expect(allocs[0].amountCents).toBe(14999);
    });

    it('keeps nulls when member has no birthDate (analytical ok mais incomplete)', async () => {
      invoices.push({
        id: 'inv-unknown',
        amountCents: 10000,
        lines: [
          {
            id: 'l1',
            memberId: 'mystery',
            baseAmountCents: 10000,
            membershipProduct: null,
            adjustments: [],
          },
        ],
      });
      const allocs = await svc.buildAllocationsForInvoice(
        clubId,
        'inv-unknown',
        occurredAt,
      );
      expect(allocs[0]).toMatchObject({
        memberId: 'mystery',
        cohortCode: null,
        gender: 'UNSPECIFIED',
        disciplineCode: null,
      });
    });

    it('includes dynamic groups snapshot at payment time', async () => {
      memberGroups.push({
        id: 'mg-1',
        memberId: 'lea',
        dynamicGroupId: 'g-1',
        dynamicGroup: { id: 'g-1', name: 'Compétiteurs' },
      });
      invoices.push({
        id: 'inv-groups',
        amountCents: 15000,
        lines: [
          {
            id: 'l1',
            memberId: 'lea',
            baseAmountCents: 15000,
            membershipProduct: { disciplineCode: 'karate' },
            adjustments: [],
          },
        ],
      });
      const allocs = await svc.buildAllocationsForInvoice(
        clubId,
        'inv-groups',
        occurredAt,
      );
      expect(allocs[0].dynamicGroupIds).toEqual(['g-1']);
      expect(allocs[0].dynamicGroupLabels).toEqual(['Compétiteurs']);
    });

    it('creates a fallback allocation for an invoice without lines', async () => {
      invoices.push({
        id: 'inv-empty',
        amountCents: 5000,
        lines: [],
      });
      const allocs = await svc.buildAllocationsForInvoice(
        clubId,
        'inv-empty',
        occurredAt,
      );
      expect(allocs).toHaveLength(1);
      expect(allocs[0].amountCents).toBe(5000);
    });
  });
});
