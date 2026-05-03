import { AccountingExportService } from './accounting-export.service';
import type { PrismaService } from '../prisma/prisma.service';

interface MockEntry {
  id: string;
  clubId: string;
  kind: 'INCOME' | 'EXPENSE' | 'IN_KIND' | 'TRANSFER';
  status: string;
  source: string;
  label: string;
  amountCents: number;
  occurredAt: Date;
  createdAt: Date;
  payment?: { externalRef: string | null } | null;
  lines: Array<{
    id: string;
    accountCode: string;
    accountLabel: string;
    debitCents: number;
    creditCents: number;
    sortOrder: number;
    allocations?: Array<{
      project: { title: string } | null;
      cohortCode: string | null;
      disciplineCode: string | null;
    }>;
  }>;
}

describe('AccountingExportService', () => {
  const clubId = 'club-1';
  let entries: MockEntry[];
  let svc: AccountingExportService;

  beforeEach(() => {
    entries = [];
    const prisma = {
      accountingEntry: {
        findMany: jest.fn(
          async ({
            where,
            orderBy: _orderBy,
            include: _include,
          }: {
            where: {
              clubId: string;
              status?: string;
              occurredAt?: { gte?: Date; lt?: Date };
            };
            orderBy?: unknown;
            include?: unknown;
          }) =>
            entries
              .filter((e) => e.clubId === where.clubId)
              .filter((e) => !where.status || e.status === where.status)
              .filter((e) =>
                where.occurredAt?.gte
                  ? e.occurredAt >= where.occurredAt.gte
                  : true,
              )
              .filter((e) =>
                where.occurredAt?.lt
                  ? e.occurredAt < where.occurredAt.lt
                  : true,
              )
              .map((e) => ({
                ...e,
                lines: e.lines.map((l) => ({
                  ...l,
                  allocations: l.allocations ?? [],
                })),
              })),
        ),
      },
    } as unknown as PrismaService;
    svc = new AccountingExportService(prisma);
  });

  describe('exportCsv', () => {
    it('returns only headers when no entry exists', async () => {
      const csv = await svc.exportCsv(clubId);
      expect(csv.split('\r\n')).toHaveLength(1);
      expect(csv).toContain('Date');
      expect(csv).toContain('Compte');
    });

    it('exports an entry with allocation analytics', async () => {
      entries.push({
        id: 'e1',
        clubId,
        kind: 'INCOME',
        status: 'POSTED',
        source: 'AUTO_MEMBER_PAYMENT',
        label: 'Cotisation Léa',
        amountCents: 15000,
        occurredAt: new Date('2026-05-10'),
        createdAt: new Date('2026-05-10'),
        lines: [
          {
            id: 'l1',
            accountCode: '706100',
            accountLabel: 'Cotisations',
            debitCents: 0,
            creditCents: 15000,
            sortOrder: 0,
            allocations: [
              {
                project: { title: 'Gala 2026' },
                cohortCode: 'ENFANT',
                disciplineCode: 'karate',
              },
            ],
          },
        ],
      });
      const csv = await svc.exportCsv(clubId);
      const lines = csv.split('\r\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('2026-05-10');
      expect(lines[1]).toContain('Cotisation Léa');
      expect(lines[1]).toContain('706100');
      expect(lines[1]).toContain('Gala 2026');
      expect(lines[1]).toContain('ENFANT');
      expect(lines[1]).toContain('karate');
      expect(lines[1]).toContain('150.00');
    });

    it('uses negative sign for expenses', async () => {
      entries.push({
        id: 'e2',
        clubId,
        kind: 'EXPENSE',
        status: 'POSTED',
        source: 'MANUAL',
        label: 'Matériel',
        amountCents: 4500,
        occurredAt: new Date('2026-05-11'),
        createdAt: new Date('2026-05-11'),
        lines: [
          {
            id: 'l1',
            accountCode: '606400',
            accountLabel: 'Fournitures',
            debitCents: 4500,
            creditCents: 0,
            sortOrder: 0,
          },
        ],
      });
      const csv = await svc.exportCsv(clubId);
      expect(csv).toContain('-45.00');
    });

    it('escapes commas and quotes RFC 4180', async () => {
      entries.push({
        id: 'e3',
        clubId,
        kind: 'EXPENSE',
        status: 'POSTED',
        source: 'MANUAL',
        label: 'Achat "spécial", urgent',
        amountCents: 1000,
        occurredAt: new Date('2026-05-12'),
        createdAt: new Date('2026-05-12'),
        lines: [
          {
            id: 'l1',
            accountCode: '606400',
            accountLabel: 'Fournitures',
            debitCents: 1000,
            creditCents: 0,
            sortOrder: 0,
          },
        ],
      });
      const csv = await svc.exportCsv(clubId);
      expect(csv).toContain('"Achat ""spécial"", urgent"');
    });

    it('respects date range filter', async () => {
      entries.push({
        id: 'old',
        clubId,
        kind: 'INCOME',
        status: 'POSTED',
        source: 'MANUAL',
        label: 'Ancien',
        amountCents: 1000,
        occurredAt: new Date('2025-01-15'),
        createdAt: new Date('2025-01-15'),
        lines: [
          {
            id: 'l1',
            accountCode: '706100',
            accountLabel: 'Cot',
            debitCents: 0,
            creditCents: 1000,
            sortOrder: 0,
          },
        ],
      });
      entries.push({
        id: 'new',
        clubId,
        kind: 'INCOME',
        status: 'POSTED',
        source: 'MANUAL',
        label: 'Récent',
        amountCents: 2000,
        occurredAt: new Date('2026-05-15'),
        createdAt: new Date('2026-05-15'),
        lines: [
          {
            id: 'l1',
            accountCode: '706100',
            accountLabel: 'Cot',
            debitCents: 0,
            creditCents: 2000,
            sortOrder: 0,
          },
        ],
      });
      const csv = await svc.exportCsv(clubId, {
        from: new Date('2026-01-01'),
        to: new Date('2027-01-01'),
      });
      expect(csv).toContain('Récent');
      expect(csv).not.toContain('Ancien');
    });
  });

  describe('exportFec', () => {
    it('generates TAB-separated rows with 18 columns', async () => {
      entries.push({
        id: 'e1',
        clubId,
        kind: 'INCOME',
        status: 'POSTED',
        source: 'AUTO_MEMBER_PAYMENT',
        label: 'Cotisation Léa',
        amountCents: 15000,
        occurredAt: new Date('2026-05-10'),
        createdAt: new Date('2026-05-11'),
        payment: { externalRef: 'pi_stripe_abc' },
        lines: [
          {
            id: 'l1',
            accountCode: '512000',
            accountLabel: 'Banque',
            debitCents: 15000,
            creditCents: 0,
            sortOrder: 0,
          },
          {
            id: 'l2',
            accountCode: '706100',
            accountLabel: 'Cotisations',
            debitCents: 0,
            creditCents: 15000,
            sortOrder: 1,
          },
        ],
      });
      const fec = await svc.exportFec(clubId);
      const lines = fec.split('\r\n');
      // 1 header + 2 lignes d'écriture
      expect(lines).toHaveLength(3);
      const header = lines[0].split('\t');
      expect(header).toHaveLength(18);
      expect(header[0]).toBe('JournalCode');
      expect(header[11]).toBe('Debit');
      expect(header[12]).toBe('Credit');
      const debitLine = lines[1].split('\t');
      expect(debitLine[0]).toBe('VT'); // Journal Ventes
      expect(debitLine[2]).toBe('000001'); // EcritureNum
      expect(debitLine[3]).toBe('20260510'); // date AAAAMMJJ
      expect(debitLine[4]).toBe('512000');
      expect(debitLine[8]).toBe('pi_stripe_abc'); // PieceRef
      expect(debitLine[11]).toBe('150,00'); // Debit avec virgule
      expect(debitLine[12]).toBe('');
    });

    it('uses journal code SU for subsidies', async () => {
      entries.push({
        id: 'e2',
        clubId,
        kind: 'INCOME',
        status: 'POSTED',
        source: 'AUTO_SUBSIDY',
        label: 'Subvention Mairie',
        amountCents: 200000,
        occurredAt: new Date('2026-03-01'),
        createdAt: new Date('2026-03-01'),
        payment: null,
        lines: [
          {
            id: 'l1',
            accountCode: '740000',
            accountLabel: 'Subventions',
            debitCents: 0,
            creditCents: 200000,
            sortOrder: 0,
          },
        ],
      });
      const fec = await svc.exportFec(clubId);
      expect(fec.split('\r\n')[1].split('\t')[0]).toBe('SU');
    });

    it('uses journal code SP for sponsoring', async () => {
      entries.push({
        id: 'e3',
        clubId,
        kind: 'INCOME',
        status: 'POSTED',
        source: 'AUTO_SPONSORSHIP',
        label: 'Decathlon',
        amountCents: 100000,
        occurredAt: new Date('2026-04-01'),
        createdAt: new Date('2026-04-01'),
        payment: null,
        lines: [
          {
            id: 'l1',
            accountCode: '754000',
            accountLabel: 'Sponsoring',
            debitCents: 0,
            creditCents: 100000,
            sortOrder: 0,
          },
        ],
      });
      const fec = await svc.exportFec(clubId);
      expect(fec.split('\r\n')[1].split('\t')[0]).toBe('SP');
    });

    it('excludes non-POSTED entries (DRAFT, NEEDS_REVIEW, CANCELLED)', async () => {
      entries.push({
        id: 'draft',
        clubId,
        kind: 'EXPENSE',
        status: 'NEEDS_REVIEW',
        source: 'OCR_AI',
        label: 'Brouillon',
        amountCents: 5000,
        occurredAt: new Date('2026-05-01'),
        createdAt: new Date('2026-05-01'),
        payment: null,
        lines: [
          {
            id: 'l1',
            accountCode: '606400',
            accountLabel: 'Fournit.',
            debitCents: 5000,
            creditCents: 0,
            sortOrder: 0,
          },
        ],
      });
      entries.push({
        id: 'posted',
        clubId,
        kind: 'EXPENSE',
        status: 'POSTED',
        source: 'MANUAL',
        label: 'Validé',
        amountCents: 3000,
        occurredAt: new Date('2026-05-02'),
        createdAt: new Date('2026-05-02'),
        payment: null,
        lines: [
          {
            id: 'l1',
            accountCode: '606400',
            accountLabel: 'Fournit.',
            debitCents: 3000,
            creditCents: 0,
            sortOrder: 0,
          },
        ],
      });
      const fec = await svc.exportFec(clubId);
      expect(fec).not.toContain('Brouillon');
      expect(fec).toContain('Validé');
    });

    it('sanitizes TAB/newline characters in libellé', async () => {
      entries.push({
        id: 'bad',
        clubId,
        kind: 'EXPENSE',
        status: 'POSTED',
        source: 'MANUAL',
        label: 'Ligne\twith\ttabs\nand\nnewlines',
        amountCents: 1000,
        occurredAt: new Date('2026-05-01'),
        createdAt: new Date('2026-05-01'),
        payment: null,
        lines: [
          {
            id: 'l1',
            accountCode: '606400',
            accountLabel: 'Fournit.',
            debitCents: 1000,
            creditCents: 0,
            sortOrder: 0,
          },
        ],
      });
      const fec = await svc.exportFec(clubId);
      const line = fec.split('\r\n')[1];
      // Le libellé ne doit contenir aucun TAB interne (sinon casse le CSV TAB)
      expect(line.split('\t')[10]).toBe('Ligne with tabs and newlines');
    });
  });
});
