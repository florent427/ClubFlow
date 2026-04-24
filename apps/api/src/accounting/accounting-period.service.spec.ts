import { ForbiddenException } from '@nestjs/common';
import { AccountingPeriodService } from './accounting-period.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('AccountingPeriodService', () => {
  const clubId = 'club-1';
  let locks: Array<{
    id: string;
    clubId: string;
    month: string;
    lockedByUserId: string;
    lockedAt: Date;
  }>;
  let closures: Array<{
    id: string;
    clubId: string;
    year: number;
    closedByUserId: string;
    closedAt: Date;
    snapshotJson: unknown;
  }>;
  let entries: Array<{
    id: string;
    clubId: string;
    kind: string;
    status: string;
    amountCents: number;
    occurredAt: Date;
  }>;
  let svc: AccountingPeriodService;

  beforeEach(() => {
    locks = [];
    closures = [];
    entries = [];
    const prisma = {
      accountingPeriodLock: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: { clubId_month: { clubId: string; month: string } };
          }) =>
            locks.find(
              (l) =>
                l.clubId === where.clubId_month.clubId &&
                l.month === where.clubId_month.month,
            ) ?? null,
        ),
        findMany: jest.fn(async ({ where }: { where: { clubId: string } }) =>
          locks.filter((l) => l.clubId === where.clubId),
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
            update: _update,
          }: {
            where: { clubId_month: { clubId: string; month: string } };
            create: typeof locks[number];
            update: Partial<typeof locks[number]>;
          }) => {
            const existing = locks.find(
              (l) =>
                l.clubId === where.clubId_month.clubId &&
                l.month === where.clubId_month.month,
            );
            if (existing) return existing;
            const row = {
              ...create,
              id: `lock-${locks.length}`,
              lockedAt: new Date(),
            };
            locks.push(row);
            return row;
          },
        ),
        deleteMany: jest.fn(
          async ({
            where,
          }: {
            where: { clubId: string; month: string };
          }) => {
            const before = locks.length;
            for (let i = locks.length - 1; i >= 0; i--) {
              if (
                locks[i].clubId === where.clubId &&
                locks[i].month === where.month
              ) {
                locks.splice(i, 1);
              }
            }
            return { count: before - locks.length };
          },
        ),
      },
      accountingFiscalYearClose: {
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: { clubId_year: { clubId: string; year: number } };
          }) =>
            closures.find(
              (c) =>
                c.clubId === where.clubId_year.clubId &&
                c.year === where.clubId_year.year,
            ) ?? null,
        ),
        findMany: jest.fn(async ({ where }: { where: { clubId: string } }) =>
          closures.filter((c) => c.clubId === where.clubId),
        ),
        upsert: jest.fn(
          async ({
            where,
            create,
          }: {
            where: { clubId_year: { clubId: string; year: number } };
            create: typeof closures[number];
          }) => {
            const existing = closures.find(
              (c) =>
                c.clubId === where.clubId_year.clubId &&
                c.year === where.clubId_year.year,
            );
            if (existing) return existing;
            const row = {
              ...create,
              id: `close-${closures.length}`,
              closedAt: new Date(),
            };
            closures.push(row);
            return row;
          },
        ),
      },
      accountingCohort: {
        findMany: jest.fn(async () => []),
      },
      accountingEntry: {
        groupBy: jest.fn(
          async ({
            where,
          }: {
            where: {
              clubId: string;
              status: string;
              occurredAt: { gte: Date; lt: Date };
            };
          }) => {
            const matching = entries.filter(
              (e) =>
                e.clubId === where.clubId &&
                e.status === where.status &&
                e.occurredAt >= where.occurredAt.gte &&
                e.occurredAt < where.occurredAt.lt,
            );
            const byKind = new Map<string, number>();
            for (const e of matching) {
              byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + e.amountCents);
            }
            return [...byKind.entries()].map(([kind, sum]) => ({
              kind,
              _sum: { amountCents: sum },
            }));
          },
        ),
      },
    } as unknown as PrismaService;
    svc = new AccountingPeriodService(prisma);
  });

  describe('toMonthCode', () => {
    it('formats as YYYY-MM (single-digit month padded)', () => {
      expect(AccountingPeriodService.toMonthCode(new Date('2026-03-15'))).toBe(
        '2026-03',
      );
      expect(AccountingPeriodService.toMonthCode(new Date('2026-11-01'))).toBe(
        '2026-11',
      );
    });
  });

  describe('isDateLocked', () => {
    it('returns false when no lock and no closure', async () => {
      const locked = await svc.isDateLocked(clubId, new Date('2026-05-10'));
      expect(locked).toBe(false);
    });

    it('returns true when the month is locked', async () => {
      locks.push({
        id: 'lock-1',
        clubId,
        month: '2026-03',
        lockedByUserId: 'user-1',
        lockedAt: new Date(),
      });
      expect(await svc.isDateLocked(clubId, new Date('2026-03-15'))).toBe(
        true,
      );
      expect(await svc.isDateLocked(clubId, new Date('2026-04-01'))).toBe(
        false,
      );
    });

    it('returns true when the fiscal year is closed (overrides month)', async () => {
      closures.push({
        id: 'close-1',
        clubId,
        year: 2025,
        closedByUserId: 'user-1',
        closedAt: new Date(),
        snapshotJson: null,
      });
      expect(await svc.isDateLocked(clubId, new Date('2025-06-15'))).toBe(
        true,
      );
      // Une autre année reste ouverte
      expect(await svc.isDateLocked(clubId, new Date('2026-06-15'))).toBe(
        false,
      );
    });
  });

  describe('assertDateIsOpen', () => {
    it('throws ForbiddenException when period is locked', async () => {
      locks.push({
        id: 'lock-1',
        clubId,
        month: '2026-02',
        lockedByUserId: 'user-1',
        lockedAt: new Date(),
      });
      await expect(
        svc.assertDateIsOpen(clubId, new Date('2026-02-10')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not throw on an open month', async () => {
      await expect(
        svc.assertDateIsOpen(clubId, new Date('2026-04-10')),
      ).resolves.toBeUndefined();
    });
  });

  describe('lockMonth / unlockMonth', () => {
    it('creates a lock row', async () => {
      await svc.lockMonth(clubId, '2026-04', 'user-1');
      expect(locks).toHaveLength(1);
      expect(locks[0].month).toBe('2026-04');
    });

    it('removes the lock row on unlockMonth', async () => {
      await svc.lockMonth(clubId, '2026-04', 'user-1');
      await svc.unlockMonth(clubId, '2026-04');
      expect(locks).toHaveLength(0);
    });

    it('is idempotent (lockMonth twice on the same month)', async () => {
      await svc.lockMonth(clubId, '2026-04', 'user-1');
      await svc.lockMonth(clubId, '2026-04', 'user-2');
      expect(locks).toHaveLength(1);
    });
  });

  describe('closeFiscalYear', () => {
    it('locks all 12 months of the year', async () => {
      await svc.closeFiscalYear(clubId, 2026, 'user-1');
      expect(locks).toHaveLength(12);
      expect(locks.map((l) => l.month).sort()).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
        '2026-11',
        '2026-12',
      ]);
    });

    it('stores totals snapshot from POSTED entries', async () => {
      entries = [
        {
          id: 'e1',
          clubId,
          kind: 'INCOME',
          status: 'POSTED',
          amountCents: 15000,
          occurredAt: new Date('2026-02-15'),
        },
        {
          id: 'e2',
          clubId,
          kind: 'EXPENSE',
          status: 'POSTED',
          amountCents: 5000,
          occurredAt: new Date('2026-06-01'),
        },
        {
          id: 'e3',
          clubId,
          kind: 'INCOME',
          status: 'CANCELLED',
          amountCents: 99999,
          occurredAt: new Date('2026-06-01'),
        },
      ];
      await svc.closeFiscalYear(clubId, 2026, 'user-1');
      const snapshot = closures[0].snapshotJson as {
        revenuesCents: number;
        expensesCents: number;
      };
      expect(snapshot.revenuesCents).toBe(15000);
      expect(snapshot.expensesCents).toBe(5000);
    });

    it('does not overwrite an already-closed year', async () => {
      closures.push({
        id: 'existing',
        clubId,
        year: 2025,
        closedByUserId: 'user-original',
        closedAt: new Date('2026-01-15'),
        snapshotJson: { revenuesCents: 1 },
      });
      await svc.closeFiscalYear(clubId, 2025, 'user-new');
      expect(closures).toHaveLength(1);
      expect(closures[0].closedByUserId).toBe('user-original');
    });
  });
});
