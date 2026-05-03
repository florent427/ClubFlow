import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SponsoringService } from './sponsoring.service';
import type { AccountingAuditService } from '../accounting/accounting-audit.service';
import type { AccountingMappingService } from '../accounting/accounting-mapping.service';
import type { PrismaService } from '../prisma/prisma.service';

interface MockDeal {
  id: string;
  clubId: string;
  sponsorName: string;
  kind: 'CASH' | 'IN_KIND';
  status: string;
  valueCents: number | null;
  amountCents: number | null;
  inKindDescription: string | null;
  projectId: string | null;
  contactId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  notes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockInstallment {
  id: string;
  dealId: string;
  clubId: string;
  expectedAmountCents: number;
  receivedAmountCents: number | null;
  expectedAt: Date | null;
  receivedAt: Date | null;
  paymentId: string | null;
  accountingEntryId: string | null;
  createdAt: Date;
}

describe('SponsoringService', () => {
  const clubId = 'club-1';
  const userId = 'user-1';
  let deals: MockDeal[];
  let installments: MockInstallment[];
  let entries: Array<Record<string, unknown>>;
  let lines: Array<Record<string, unknown>>;
  let allocations: Array<Record<string, unknown>>;
  let accounts: Array<{ clubId: string; code: string; label: string }>;
  let moduleEnabled: boolean;
  let mapping: jest.Mocked<AccountingMappingService>;
  let audit: jest.Mocked<AccountingAuditService>;
  let svc: SponsoringService;

  beforeEach(() => {
    deals = [];
    installments = [];
    entries = [];
    lines = [];
    allocations = [];
    accounts = [
      { clubId, code: '512000', label: 'Banque' },
      { clubId, code: '754000', label: 'Sponsoring' },
      { clubId, code: '860000', label: 'Secours en nature' },
      { clubId, code: '871000', label: 'Prestations en nature' },
    ];
    moduleEnabled = true;

    const txClient = {
      sponsorshipInstallment: {
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
    };

    const prisma = {
      sponsorshipDeal: {
        findMany: jest.fn(async ({ where }: { where: { clubId: string } }) =>
          deals
            .filter((d) => d.clubId === where.clubId)
            .map((d) => ({
              ...d,
              installments: installments.filter((i) => i.dealId === d.id),
              documents: [],
            })),
        ),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: { id: string; clubId: string };
          }) => {
            const d = deals.find(
              (x) => x.id === where.id && x.clubId === where.clubId,
            );
            if (!d) return null;
            return {
              ...d,
              installments: installments.filter((i) => i.dealId === d.id),
              documents: [],
              project: null,
              contact: null,
            };
          },
        ),
        create: jest.fn(async ({ data }: { data: Partial<MockDeal> }) => {
          const row: MockDeal = {
            id: `d-${deals.length}`,
            clubId,
            sponsorName: data.sponsorName ?? '',
            kind: data.kind ?? 'CASH',
            status: 'DRAFT',
            valueCents: data.valueCents ?? null,
            amountCents: data.amountCents ?? null,
            inKindDescription: data.inKindDescription ?? null,
            projectId: data.projectId ?? null,
            contactId: data.contactId ?? null,
            startsAt: data.startsAt ?? null,
            endsAt: data.endsAt ?? null,
            notes: data.notes ?? null,
            createdByUserId: data.createdByUserId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          deals.push(row);
          return row;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<MockDeal>;
          }) => {
            const d = deals.find((x) => x.id === where.id);
            if (!d) throw new Error('not found');
            Object.assign(d, data);
            return d;
          },
        ),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const idx = deals.findIndex((d) => d.id === where.id);
          if (idx >= 0) deals.splice(idx, 1);
          return { id: where.id };
        }),
      },
      sponsorshipInstallment: {
        create: jest.fn(
          async ({ data }: { data: Partial<MockInstallment> }) => {
            const row: MockInstallment = {
              id: `i-${installments.length}`,
              dealId: data.dealId ?? '',
              clubId,
              expectedAmountCents: data.expectedAmountCents ?? 0,
              receivedAmountCents: null,
              expectedAt: data.expectedAt ?? null,
              receivedAt: null,
              paymentId: null,
              accountingEntryId: null,
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
            const deal = deals.find((d) => d.id === i.dealId);
            return deal ? { ...i, deal } : null;
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
      accountingEntry: {
        findFirst: jest.fn(async () => null),
      },
      clubModule: {
        findUnique: jest.fn(async () => ({ enabled: moduleEnabled })),
      },
      $transaction: jest.fn(
        async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
      ),
    } as unknown as PrismaService;

    mapping = {
      resolveAccountCode: jest.fn(
        async (_clubId: string, sourceType: string) => {
          if (sourceType === 'SPONSORSHIP_CASH') return '754000';
          if (sourceType === 'SPONSORSHIP_IN_KIND') return '871000';
          if (sourceType === 'BANK_ACCOUNT') return '512000';
          return '606800';
        },
      ),
    } as unknown as jest.Mocked<AccountingMappingService>;

    audit = {
      log: jest.fn(async () => {}),
    } as unknown as jest.Mocked<AccountingAuditService>;

    svc = new SponsoringService(prisma, mapping, audit);
  });

  describe('create', () => {
    it('creates a CASH deal in DRAFT status', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'CASH',
        valueCents: 200000,
      });
      expect(d.status).toBe('DRAFT');
      expect(d.kind).toBe('CASH');
    });

    it('requires inKindDescription for IN_KIND deals', async () => {
      await expect(
        svc.create(clubId, userId, {
          sponsorName: 'Decathlon',
          kind: 'IN_KIND',
          valueCents: 100000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts IN_KIND when description is provided', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'IN_KIND',
        valueCents: 30000,
        inKindDescription: '20 T-shirts',
      });
      expect(d.kind).toBe('IN_KIND');
    });
  });

  describe('activate', () => {
    it('transitions DRAFT → ACTIVE', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'CASH',
        valueCents: 100000,
      });
      const r = await svc.activate(clubId, userId, d.id);
      expect(r.status).toBe('ACTIVE');
      expect(entries).toHaveLength(0); // pas d'entry pour du cash sans tranche
    });

    it('generates neutral IN_KIND accounting entry (860/871) on activate', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'IN_KIND',
        valueCents: 30000,
        inKindDescription: '20 T-shirts',
        projectId: 'proj-1',
      });
      await svc.activate(clubId, userId, d.id);
      expect(entries).toHaveLength(1);
      expect(entries[0].kind).toBe('IN_KIND');
      expect(entries[0].source).toBe('AUTO_SPONSORSHIP');
      expect(entries[0].amountCents).toBe(30000);
      expect(entries[0].projectId).toBe('proj-1');
      // 2 lignes : débit 860 + crédit 871
      expect(lines).toHaveLength(2);
      const debitLine = lines.find((l) => l.accountCode === '860000');
      const creditLine = lines.find((l) => l.accountCode === '871000');
      expect(debitLine?.debitCents).toBe(30000);
      expect(creditLine?.creditCents).toBe(30000);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].projectId).toBe('proj-1');
    });

    it('does not generate IN_KIND entry when module disabled', async () => {
      moduleEnabled = false;
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'IN_KIND',
        valueCents: 30000,
        inKindDescription: 'matériel',
      });
      await svc.activate(clubId, userId, d.id);
      expect(entries).toHaveLength(0);
    });

    it('throws when activating a CLOSED deal', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'CASH',
        valueCents: 100000,
      });
      deals[0].status = 'CLOSED';
      await expect(svc.activate(clubId, userId, d.id)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('installments', () => {
    it('refuses to add installment on an IN_KIND deal', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'IN_KIND',
        valueCents: 30000,
        inKindDescription: 'matériel',
      });
      await expect(
        svc.addInstallment(clubId, d.id, { expectedAmountCents: 10000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts installment on CASH deal', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'CASH',
        valueCents: 100000,
      });
      const i = await svc.addInstallment(clubId, d.id, {
        expectedAmountCents: 50000,
      });
      expect(i.dealId).toBe(d.id);
    });

    it('markInstallmentReceived creates AUTO_SPONSORSHIP entry', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'Decathlon',
        kind: 'CASH',
        valueCents: 100000,
        projectId: 'proj-2',
      });
      await svc.activate(clubId, userId, d.id);
      const i = await svc.addInstallment(clubId, d.id, {
        expectedAmountCents: 50000,
      });
      await svc.markInstallmentReceived(clubId, userId, i.id, {
        receivedAmountCents: 50000,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].source).toBe('AUTO_SPONSORSHIP');
      expect(entries[0].kind).toBe('INCOME');
      expect(entries[0].amountCents).toBe(50000);
      expect(entries[0].projectId).toBe('proj-2');
    });

    it('refuses to mark installment on IN_KIND deal', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'X',
        kind: 'IN_KIND',
        valueCents: 30000,
        inKindDescription: 'x',
      });
      // Simulated: create a rogue installment via direct state push, then try to mark it
      installments.push({
        id: 'i-rogue',
        dealId: d.id,
        clubId,
        expectedAmountCents: 10000,
        receivedAmountCents: null,
        expectedAt: null,
        receivedAt: null,
        paymentId: null,
        accountingEntryId: null,
        createdAt: new Date(),
      });
      await expect(
        svc.markInstallmentReceived(clubId, userId, 'i-rogue', {
          receivedAmountCents: 10000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('lifecycle', () => {
    it('close transitions to CLOSED', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'X',
        kind: 'CASH',
        valueCents: 100,
      });
      const r = await svc.close(clubId, d.id);
      expect(r.status).toBe('CLOSED');
    });

    it('cancel transitions to CANCELLED', async () => {
      const d = await svc.create(clubId, userId, {
        sponsorName: 'X',
        kind: 'CASH',
        valueCents: 100,
      });
      const r = await svc.cancel(clubId, d.id);
      expect(r.status).toBe('CANCELLED');
    });

    it('getOne throws NotFound for invalid id', async () => {
      await expect(svc.getOne(clubId, 'ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
