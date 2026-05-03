import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GrantsService } from './grants.service';
import type { AccountingAuditService } from '../accounting/accounting-audit.service';
import type { AccountingMappingService } from '../accounting/accounting-mapping.service';
import type { PrismaService } from '../prisma/prisma.service';

interface MockGrant {
  id: string;
  clubId: string;
  title: string;
  fundingBody: string | null;
  status: string;
  requestedAmountCents: number | null;
  grantedAmountCents: number | null;
  amountCents: number | null;
  projectId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  reportDueAt: Date | null;
  reportSubmittedAt: Date | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockInstallment {
  id: string;
  grantId: string;
  clubId: string;
  expectedAmountCents: number;
  receivedAmountCents: number | null;
  expectedAt: Date | null;
  receivedAt: Date | null;
  paymentId: string | null;
  accountingEntryId: string | null;
  notes: string | null;
  createdAt: Date;
}

describe('GrantsService', () => {
  const clubId = 'club-1';
  const userId = 'user-1';
  let grants: MockGrant[];
  let installments: MockInstallment[];
  let entries: Array<Record<string, unknown>>;
  let lines: Array<Record<string, unknown>>;
  let allocations: Array<Record<string, unknown>>;
  let accounts: Array<{ clubId: string; code: string; label: string }>;
  let mapping: jest.Mocked<AccountingMappingService>;
  let audit: jest.Mocked<AccountingAuditService>;
  let moduleEnabled: boolean;
  let svc: GrantsService;

  beforeEach(() => {
    grants = [];
    installments = [];
    entries = [];
    lines = [];
    allocations = [];
    accounts = [
      { clubId, code: '740000', label: 'Subventions' },
      { clubId, code: '512000', label: 'Banque' },
    ];
    moduleEnabled = true;

    const txClient = {
      grantInstallment: {
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<MockInstallment>;
          }) => {
            const i = installments.find((x) => x.id === where.id);
            if (!i) throw new Error('inst not found');
            Object.assign(i, data);
            return i;
          },
        ),
        findMany: jest.fn(
          async ({ where }: { where: { grantId: string } }) =>
            installments.filter((i) => i.grantId === where.grantId),
        ),
      },
      clubModule: {
        findUnique: jest.fn(async () => ({ enabled: moduleEnabled })),
      },
      accountingEntry: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, id: `e-${entries.length}` };
          entries.push(row);
          return row;
        }),
      },
      accountingEntryLine: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, id: `l-${lines.length}` };
          lines.push(row);
          return row;
        }),
      },
      accountingAllocation: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, id: `a-${allocations.length}` };
          allocations.push(row);
          return row;
        }),
      },
      grantApplication: {
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<MockGrant>;
          }) => {
            const g = grants.find((x) => x.id === where.id);
            if (!g) throw new Error('grant not found');
            Object.assign(g, data);
            return g;
          },
        ),
      },
    };

    const prisma = {
      grantApplication: {
        findMany: jest.fn(async ({ where }: { where: { clubId: string } }) =>
          grants
            .filter(
              (g) =>
                g.clubId === where.clubId &&
                (!('status' in where) ||
                  g.status === (where as { status?: string }).status ||
                  (where as { status?: string }).status === undefined),
            )
            .map((g) => ({
              ...g,
              installments: installments.filter((i) => i.grantId === g.id),
              documents: [],
            })),
        ),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: { id: string; clubId: string };
          }) => {
            const g = grants.find(
              (x) => x.id === where.id && x.clubId === where.clubId,
            );
            if (!g) return null;
            return {
              ...g,
              installments: installments.filter((i) => i.grantId === g.id),
              documents: [],
              project: null,
            };
          },
        ),
        create: jest.fn(async ({ data }: { data: Partial<MockGrant> }) => {
          const row: MockGrant = {
            id: `g-${grants.length}`,
            clubId,
            title: data.title ?? '',
            fundingBody: data.fundingBody ?? null,
            status: 'DRAFT',
            requestedAmountCents: data.requestedAmountCents ?? null,
            grantedAmountCents: null,
            amountCents: data.amountCents ?? null,
            projectId: data.projectId ?? null,
            startsAt: data.startsAt ?? null,
            endsAt: data.endsAt ?? null,
            reportDueAt: data.reportDueAt ?? null,
            reportSubmittedAt: null,
            notes: data.notes ?? null,
            createdByUserId: data.createdByUserId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          grants.push(row);
          return row;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<MockGrant>;
          }) => {
            const g = grants.find((x) => x.id === where.id);
            if (!g) throw new Error('not found');
            Object.assign(g, data);
            return g;
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const idx = grants.findIndex((g) => g.id === where.id);
          if (idx >= 0) grants.splice(idx, 1);
          return { id: where.id };
        }),
      },
      grantInstallment: {
        create: jest.fn(
          async ({ data }: { data: Partial<MockInstallment> }) => {
            const row: MockInstallment = {
              id: `i-${installments.length}`,
              grantId: data.grantId ?? '',
              clubId,
              expectedAmountCents: data.expectedAmountCents ?? 0,
              receivedAmountCents: null,
              expectedAt: data.expectedAt ?? null,
              receivedAt: null,
              paymentId: null,
              accountingEntryId: null,
              notes: data.notes ?? null,
              createdAt: new Date(),
            };
            installments.push(row);
            return row;
          },
        ),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: { id: string; clubId: string };
          }) => {
            const i = installments.find((x) => x.id === where.id);
            if (!i) return null;
            const grant = grants.find((g) => g.id === i.grantId);
            return grant ? { ...i, grant } : null;
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const idx = installments.findIndex((i) => i.id === where.id);
          if (idx >= 0) installments.splice(idx, 1);
          return { id: where.id };
        }),
      },
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
      },
      $transaction: jest.fn(
        async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
      ),
    } as unknown as PrismaService;

    mapping = {
      resolveAccountCode: jest.fn(async (_clubId: string, sourceType: string) => {
        if (sourceType === 'SUBSIDY') return '740000';
        if (sourceType === 'BANK_ACCOUNT') return '512000';
        return '606800';
      }),
    } as unknown as jest.Mocked<AccountingMappingService>;

    audit = {
      log: jest.fn(async () => {}),
    } as unknown as jest.Mocked<AccountingAuditService>;

    svc = new GrantsService(prisma, mapping, audit);
  });

  async function seedGrant(overrides: Partial<MockGrant> = {}): Promise<MockGrant> {
    const row: MockGrant = {
      id: `g-${grants.length}`,
      clubId,
      title: 'Subvention Mairie',
      fundingBody: 'Mairie',
      status: 'DRAFT',
      requestedAmountCents: 200000,
      grantedAmountCents: null,
      amountCents: null,
      projectId: null,
      startsAt: null,
      endsAt: null,
      reportDueAt: null,
      reportSubmittedAt: null,
      notes: null,
      createdByUserId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    grants.push(row);
    return row;
  }

  describe('CRUD', () => {
    it('creates a grant in DRAFT by default', async () => {
      const g = await svc.create(clubId, userId, {
        title: 'Subv CNDS',
        fundingBody: 'CNDS',
        requestedAmountCents: 150000,
      });
      expect(g.status).toBe('DRAFT');
      expect(g.title).toBe('Subv CNDS');
    });

    it('getOne throws NotFoundException when id does not exist', async () => {
      await expect(svc.getOne(clubId, 'ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('workflow transitions', () => {
    it('submit DRAFT → REQUESTED', async () => {
      const g = await seedGrant();
      const r = await svc.submit(clubId, g.id);
      expect(r.status).toBe('REQUESTED');
    });

    it('submit from non-DRAFT throws BadRequestException', async () => {
      const g = await seedGrant({ status: 'GRANTED' });
      await expect(svc.submit(clubId, g.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('markGranted updates amount and status', async () => {
      const g = await seedGrant({ status: 'REQUESTED' });
      const r = await svc.markGranted(clubId, g.id, 180000);
      expect(r.status).toBe('GRANTED');
      expect(r.grantedAmountCents).toBe(180000);
      expect(r.amountCents).toBe(180000);
    });

    it('markGranted rejects amount <= 0', async () => {
      const g = await seedGrant({ status: 'REQUESTED' });
      await expect(svc.markGranted(clubId, g.id, 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('markReported requires PAID or PARTIALLY_PAID status', async () => {
      const g1 = await seedGrant({ status: 'GRANTED' });
      await expect(svc.markReported(clubId, g1.id)).rejects.toThrow(
        BadRequestException,
      );
      const g2 = await seedGrant({ status: 'PAID' });
      const r = await svc.markReported(clubId, g2.id);
      expect(r.status).toBe('REPORTED');
      expect(r.reportSubmittedAt).toBeDefined();
    });

    it('settle requires REPORTED status', async () => {
      const g = await seedGrant({ status: 'PAID' });
      await expect(svc.settle(clubId, g.id)).rejects.toThrow(
        BadRequestException,
      );
      g.status = 'REPORTED';
      const r = await svc.settle(clubId, g.id);
      expect(r.status).toBe('SETTLED');
    });

    it('archive works from any status', async () => {
      const g = await seedGrant({ status: 'SETTLED' });
      const r = await svc.archive(clubId, g.id);
      expect(r.status).toBe('ARCHIVED');
    });

    it('reject sets status to REJECTED', async () => {
      const g = await seedGrant({ status: 'REQUESTED' });
      const r = await svc.reject(clubId, g.id);
      expect(r.status).toBe('REJECTED');
    });
  });

  describe('installments', () => {
    it('addInstallment creates a row linked to the grant', async () => {
      const g = await seedGrant({ status: 'GRANTED' });
      const i = await svc.addInstallment(clubId, g.id, {
        expectedAmountCents: 100000,
      });
      expect(i.grantId).toBe(g.id);
      expect(i.expectedAmountCents).toBe(100000);
    });

    it('removeInstallment refuses to remove a received tranche', async () => {
      const g = await seedGrant({ status: 'GRANTED' });
      const i = await svc.addInstallment(clubId, g.id, {
        expectedAmountCents: 100000,
      });
      installments[0].receivedAt = new Date();
      await expect(svc.removeInstallment(clubId, i.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('markInstallmentReceived creates an AccountingEntry AUTO_SUBSIDY', async () => {
      const g = await seedGrant({ status: 'GRANTED', projectId: 'proj-1' });
      const i = await svc.addInstallment(clubId, g.id, {
        expectedAmountCents: 100000,
      });
      await svc.markInstallmentReceived(clubId, userId, i.id, {
        receivedAmountCents: 100000,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBe('AUTO_SUBSIDY');
      expect(entries[0].kind).toBe('INCOME');
      expect(entries[0].amountCents).toBe(100000);
      expect(entries[0].projectId).toBe('proj-1');
      // 2 lignes (débit banque + crédit 740)
      expect(lines).toHaveLength(2);
      // 1 allocation sur la ligne 740
      expect(allocations).toHaveLength(1);
      expect(allocations[0].amountCents).toBe(100000);
      expect(allocations[0].projectId).toBe('proj-1');
      // Le statut du dossier passe à PAID (reçu = attendu)
      expect(grants[0].status).toBe('PAID');
      // Audit log créé
      expect(audit.log).toHaveBeenCalled();
    });

    it('partial receipt sets status to PARTIALLY_PAID', async () => {
      const g = await seedGrant({ status: 'GRANTED' });
      const i = await svc.addInstallment(clubId, g.id, {
        expectedAmountCents: 100000,
      });
      await svc.markInstallmentReceived(clubId, userId, i.id, {
        receivedAmountCents: 50000,
      });
      expect(grants[0].status).toBe('PARTIALLY_PAID');
    });

    it('does not create entry when accounting module is disabled', async () => {
      moduleEnabled = false;
      const g = await seedGrant({ status: 'GRANTED' });
      const i = await svc.addInstallment(clubId, g.id, {
        expectedAmountCents: 100000,
      });
      await svc.markInstallmentReceived(clubId, userId, i.id, {
        receivedAmountCents: 100000,
      });
      expect(entries).toHaveLength(0);
    });

    it('refuses to mark already-received tranche', async () => {
      const g = await seedGrant({ status: 'GRANTED' });
      const i = await svc.addInstallment(clubId, g.id, {
        expectedAmountCents: 100000,
      });
      installments[0].receivedAt = new Date();
      await expect(
        svc.markInstallmentReceived(clubId, userId, i.id, {
          receivedAmountCents: 100000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
