import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AccountingConsolidationService } from './accounting-consolidation.service';
import type { AccountingAuditService } from './accounting-audit.service';
import type { PrismaService } from '../prisma/prisma.service';

interface FakeAlloc {
  id: string;
  amountCents: number;
  projectId: string | null;
  cohortCode: string | null;
  disciplineCode: string | null;
  gender: string | null;
  memberId: string | null;
  dynamicGroupIdsSnapshot: string[];
  dynamicGroupLabelsSnapshot: string[];
  freeformTags: string[];
}
interface FakeLine {
  id: string;
  entryId: string;
  clubId: string;
  accountCode: string;
  accountLabel: string;
  label: string | null;
  side: 'DEBIT' | 'CREDIT' | 'AUTO';
  debitCents: number;
  creditCents: number;
  sortOrder: number;
  iaSuggestedAccountCode: string | null;
  iaReasoning: string | null;
  iaConfidencePct: number | null;
  validatedAt: Date | null;
  mergedFromArticleLabels: string[];
  allocations: FakeAlloc[];
}
interface FakeEntry {
  id: string;
  clubId: string;
  status: 'NEEDS_REVIEW' | 'POSTED' | 'LOCKED' | 'CANCELLED';
  consolidatedAt: Date | null;
  preConsolidationSnapshot: unknown;
  lines: FakeLine[];
}

describe('AccountingConsolidationService', () => {
  const clubId = 'club-1';
  let entries: FakeEntry[];
  let svc: AccountingConsolidationService;
  let auditMock: jest.Mock;

  function makeAlloc(
    id: string,
    overrides: Partial<FakeAlloc> = {},
  ): FakeAlloc {
    return {
      id,
      amountCents: 1000,
      projectId: null,
      cohortCode: null,
      disciplineCode: null,
      gender: null,
      memberId: null,
      dynamicGroupIdsSnapshot: [],
      dynamicGroupLabelsSnapshot: [],
      freeformTags: [],
      ...overrides,
    };
  }

  function makeLine(
    id: string,
    overrides: Partial<FakeLine> = {},
  ): FakeLine {
    return {
      id,
      entryId: 'e-1',
      clubId,
      accountCode: '625700',
      accountLabel: 'Réceptions',
      label: `Article ${id}`,
      side: 'DEBIT',
      debitCents: 1000,
      creditCents: 0,
      sortOrder: 0,
      iaSuggestedAccountCode: '625700',
      iaReasoning: null,
      iaConfidencePct: 95,
      validatedAt: null,
      mergedFromArticleLabels: [],
      allocations: [makeAlloc(`alloc-${id}`)],
      ...overrides,
    };
  }

  function fakePrisma(): PrismaService {
    return {
      accountingEntry: {
        findFirst: jest.fn(
          async (args: { where: { clubId: string; id: string } }) =>
            entries.find(
              (e) =>
                e.clubId === args.where.clubId && e.id === args.where.id,
            ) ?? null,
        ),
        update: jest.fn(
          async (args: { where: { id: string }; data: Partial<FakeEntry> }) => {
            const e = entries.find((x) => x.id === args.where.id);
            if (e) Object.assign(e, args.data);
            return e;
          },
        ),
      },
      accountingEntryLine: {
        create: jest.fn(
          async (args: { data: Partial<FakeLine> & { entryId: string } }) => {
            const id = `new-${Math.random().toString(36).slice(2, 8)}`;
            const e = entries.find((x) => x.id === args.data.entryId);
            if (!e) throw new Error('Entry missing');
            const line: FakeLine = {
              id,
              entryId: args.data.entryId,
              clubId: args.data.clubId ?? clubId,
              accountCode: args.data.accountCode!,
              accountLabel: args.data.accountLabel!,
              label: args.data.label ?? null,
              side: (args.data.side as FakeLine['side']) ?? 'DEBIT',
              debitCents: args.data.debitCents ?? 0,
              creditCents: args.data.creditCents ?? 0,
              sortOrder: args.data.sortOrder ?? 0,
              iaSuggestedAccountCode: args.data.iaSuggestedAccountCode ?? null,
              iaReasoning: args.data.iaReasoning ?? null,
              iaConfidencePct: args.data.iaConfidencePct ?? null,
              validatedAt: args.data.validatedAt ?? null,
              mergedFromArticleLabels: args.data.mergedFromArticleLabels ?? [],
              allocations: [],
            };
            e.lines.push(line);
            return line;
          },
        ),
        deleteMany: jest.fn(
          async (args: { where: { id: { in: string[] } } }) => {
            const ids = new Set(args.where.id.in);
            for (const e of entries)
              e.lines = e.lines.filter((l) => !ids.has(l.id));
            return { count: ids.size };
          },
        ),
      },
      accountingAllocation: {
        create: jest.fn(async (args: { data: Partial<FakeAlloc> & { lineId: string } }) => {
          for (const e of entries) {
            const line = e.lines.find((l) => l.id === args.data.lineId);
            if (line) {
              const alloc: FakeAlloc = {
                id: `alloc-${Math.random().toString(36).slice(2, 8)}`,
                amountCents: args.data.amountCents ?? 0,
                projectId: args.data.projectId ?? null,
                cohortCode: args.data.cohortCode ?? null,
                disciplineCode: args.data.disciplineCode ?? null,
                gender: args.data.gender ?? null,
                memberId: args.data.memberId ?? null,
                dynamicGroupIdsSnapshot:
                  args.data.dynamicGroupIdsSnapshot ?? [],
                dynamicGroupLabelsSnapshot:
                  args.data.dynamicGroupLabelsSnapshot ?? [],
                freeformTags: args.data.freeformTags ?? [],
              };
              line.allocations.push(alloc);
              return alloc;
            }
          }
          throw new Error('Line missing');
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          accountingEntry: {
            update: jest.fn(
              async (args: { where: { id: string }; data: Partial<FakeEntry> }) => {
                const e = entries.find((x) => x.id === args.where.id);
                if (e) Object.assign(e, args.data);
                return e;
              },
            ),
          },
          accountingEntryLine: {
            create: jest.fn(async (args: { data: Partial<FakeLine> & { entryId: string } }) => {
              const id = `new-${Math.random().toString(36).slice(2, 8)}`;
              const e = entries.find((x) => x.id === args.data.entryId);
              if (!e) throw new Error('Entry missing');
              const line: FakeLine = {
                id,
                entryId: args.data.entryId,
                clubId: args.data.clubId ?? clubId,
                accountCode: args.data.accountCode!,
                accountLabel: args.data.accountLabel!,
                label: args.data.label ?? null,
                side: (args.data.side as FakeLine['side']) ?? 'DEBIT',
                debitCents: args.data.debitCents ?? 0,
                creditCents: args.data.creditCents ?? 0,
                sortOrder: args.data.sortOrder ?? 0,
                iaSuggestedAccountCode: null,
                iaReasoning: null,
                iaConfidencePct: null,
                validatedAt: null,
                mergedFromArticleLabels:
                  args.data.mergedFromArticleLabels ?? [],
                allocations: [],
              };
              e.lines.push(line);
              return line;
            }),
            deleteMany: jest.fn(
              async (args: { where: { id: { in: string[] } } }) => {
                const ids = new Set(args.where.id.in);
                for (const e of entries)
                  e.lines = e.lines.filter((l) => !ids.has(l.id));
                return { count: ids.size };
              },
            ),
          },
          accountingAllocation: {
            create: jest.fn(async (args: { data: Partial<FakeAlloc> & { lineId: string } }) => {
              for (const e of entries) {
                const line = e.lines.find((l) => l.id === args.data.lineId);
                if (line) {
                  const alloc: FakeAlloc = {
                    id: `alloc-${Math.random().toString(36).slice(2, 8)}`,
                    amountCents: args.data.amountCents ?? 0,
                    projectId: args.data.projectId ?? null,
                    cohortCode: args.data.cohortCode ?? null,
                    disciplineCode: args.data.disciplineCode ?? null,
                    gender: args.data.gender ?? null,
                    memberId: args.data.memberId ?? null,
                    dynamicGroupIdsSnapshot: [],
                    dynamicGroupLabelsSnapshot: [],
                    freeformTags: [],
                  };
                  line.allocations.push(alloc);
                  return alloc;
                }
              }
              throw new Error('Line missing');
            }),
          },
        }),
      ),
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    auditMock = jest.fn(async () => undefined);
    const audit = { log: auditMock } as unknown as AccountingAuditService;
    entries = [];
    svc = new AccountingConsolidationService(fakePrisma(), audit);
  });

  describe('preview', () => {
    it('non éligible si entry POSTED', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'POSTED',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [makeLine('l1'), makeLine('l2')],
      });
      const r = await svc.preview(clubId, 'e-1');
      expect(r.eligible).toBe(false);
      expect(r.reason).toMatch(/NEEDS_REVIEW/);
    });

    it('non éligible si déjà consolidée', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: new Date(),
        preConsolidationSnapshot: [],
        lines: [makeLine('l1')],
      });
      const r = await svc.preview(clubId, 'e-1');
      expect(r.eligible).toBe(false);
      expect(r.reason).toMatch(/déjà consolidée/);
    });

    it('non éligible si une ligne validée', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [
          makeLine('l1', { validatedAt: new Date() }),
          makeLine('l2'),
        ],
      });
      const r = await svc.preview(clubId, 'e-1');
      expect(r.eligible).toBe(false);
      expect(r.reason).toMatch(/validée/);
    });

    it('non éligible si IA encore en cours', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [
          makeLine('l1', {
            iaSuggestedAccountCode: null,
            iaConfidencePct: null,
          }),
          makeLine('l2'),
        ],
      });
      const r = await svc.preview(clubId, 'e-1');
      expect(r.eligible).toBe(false);
      expect(r.reason).toMatch(/IA encore en cours/);
    });

    it('non éligible si tous comptes différents (rien à grouper)', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [
          makeLine('l1', { accountCode: '625700', accountLabel: 'Réceptions' }),
          makeLine('l2', { accountCode: '606300', accountLabel: 'Petit équipement' }),
        ],
      });
      const r = await svc.preview(clubId, 'e-1');
      expect(r.eligible).toBe(false);
      expect(r.reason).toMatch(/comptes distincts/);
    });

    it('éligible si N lignes même compte + même analytique', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [
          makeLine('l1'),
          makeLine('l2'),
          makeLine('l3'),
        ],
      });
      const r = await svc.preview(clubId, 'e-1');
      expect(r.eligible).toBe(true);
      expect(r.groups).toHaveLength(1);
      expect(r.groups[0].lineCount).toBe(3);
      expect(r.groups[0].totalCents).toBe(3000);
    });
  });

  describe('consolidate', () => {
    it('happy path : 3 lignes même compte → 1 ligne consolidée', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [
          makeLine('l1', { label: 'Entrée', debitCents: 800 }),
          makeLine('l2', { label: 'Plat', debitCents: 1500 }),
          makeLine('l3', { label: 'Café', debitCents: 250 }),
        ],
      });
      const result = await svc.consolidate(clubId, 'user-1', 'e-1');
      expect(result.mergedGroups).toBe(1);
      expect(result.removedLines).toBe(3);

      const e = entries.find((x) => x.id === 'e-1')!;
      expect(e.consolidatedAt).not.toBeNull();
      expect(e.preConsolidationSnapshot).not.toBeNull();
      expect(e.lines).toHaveLength(1); // les 3 originales remplacées par 1 nouvelle
      expect(e.lines[0].debitCents).toBe(2550);
      expect(e.lines[0].mergedFromArticleLabels).toEqual([
        'Entrée',
        'Plat',
        'Café',
      ]);
      expect(auditMock).toHaveBeenCalled();
    });

    it("ne consolide PAS un groupe si les allocations divergent", async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [
          makeLine('l1', {
            allocations: [makeAlloc('a1', { projectId: 'proj-A' })],
          }),
          makeLine('l2', {
            allocations: [makeAlloc('a2', { projectId: 'proj-B' })],
          }),
        ],
      });
      const result = await svc.consolidate(clubId, 'user-1', 'e-1');
      // Allocations divergentes → 2 groupes singletons → aucun merge
      expect(result.mergedGroups).toBe(0);
      expect(result.removedLines).toBe(0);
      const e = entries.find((x) => x.id === 'e-1')!;
      // Marquage consolidatedAt même si rien fusionné (snapshot fait, pour idempotence)
      expect(e.consolidatedAt).not.toBeNull();
    });

    it('refus si POSTED', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'POSTED',
        consolidatedAt: null,
        preConsolidationSnapshot: null,
        lines: [makeLine('l1'), makeLine('l2')],
      });
      await expect(svc.consolidate(clubId, 'u', 'e-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refus si déjà consolidée', async () => {
      entries.push({
        id: 'e-1',
        clubId,
        status: 'NEEDS_REVIEW',
        consolidatedAt: new Date(),
        preConsolidationSnapshot: [],
        lines: [makeLine('l1')],
      });
      await expect(svc.consolidate(clubId, 'u', 'e-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
