import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { BankStatementLineStatus } from '@prisma/client';
import { CurrentClub } from '../../common/decorators/current-club.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireClubModule } from '../../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../../common/types/request-user';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import { formatIsoDate, parseIsoDate } from '../accounting-fiscal-year.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import type { Candidate } from './bank-reconciliation.service';
import { BankStatementService } from './bank-statement.service';
import type {
  LineRow,
  StatementDetailRow,
  StatementListRow,
} from './bank-statement.service';
import type { CsvMapping } from './csv-parser';
import {
  AddBankStatementLineInput,
  CsvMappingInput,
  IgnoreBankLineInput,
  ImportBankStatementInput,
  MatchBankLineInput,
  PreviewCsvStatementInput,
  UpdateBankStatementLineInput,
} from './dto/bank-import.input';
import {
  BankLineCandidateGraph,
  BankStatementGraph,
  BankStatementLineGraph,
  BankStatementListItemGraph,
  CsvPreviewGraph,
  ReconciliationAccountSummaryGraph,
} from './models/bank-statement.model';

type Counts = Partial<Record<BankStatementLineStatus, number>>;

function toMapping(input: CsvMappingInput): CsvMapping {
  return {
    delimiter: input.delimiter,
    hasHeader: input.hasHeader,
    dateCol: input.dateCol,
    labelCol: input.labelCol,
    amountCol: input.amountCol ?? null,
    debitCol: input.debitCol ?? null,
    creditCol: input.creditCol ?? null,
    balanceCol: input.balanceCol ?? null,
    valueDateCol: input.valueDateCol ?? null,
    referenceCol: input.referenceCol ?? null,
    dateFormat: input.dateFormat,
    decimalSeparator: input.decimalSeparator,
  };
}

export function toLineGraph(l: LineRow): BankStatementLineGraph {
  return {
    id: l.id,
    lineIndex: l.lineIndex,
    bookedOn: formatIsoDate(l.bookedOn),
    valueOn: l.valueOn ? formatIsoDate(l.valueOn) : null,
    label: l.label,
    rawLabel: l.rawLabel,
    reference: l.reference,
    amountCents: l.amountCents,
    balanceAfterCents: l.balanceAfterCents,
    status: l.status,
    ignoreReason: l.ignoreReason,
    ignoreNote: l.ignoreNote,
    candidateEntryIds: l.candidateEntryIds,
    matches: l.matches.map((m) => ({
      entryId: m.entryId,
      amountCents: m.amountCents,
      origin: m.origin,
      entryLabel: m.entry.label,
      entryOccurredAt: m.entry.occurredAt,
      entryKind: m.entry.kind,
      entrySource: m.entry.source,
      entryAmountCents: m.entry.amountCents,
    })),
    resolvedAt: l.resolvedAt,
  };
}

function toListItem(s: StatementListRow, counts: Counts): BankStatementListItemGraph {
  return {
    id: s.id,
    financialAccountId: s.financialAccountId,
    financialAccountLabel: s.financialAccount.label,
    format: s.format,
    status: s.status,
    periodStart: formatIsoDate(s.periodStart),
    periodEnd: formatIsoDate(s.periodEnd),
    openingBalanceCents: s.openingBalanceCents,
    closingBalanceCents: s.closingBalanceCents,
    lineCount: s.lineCount,
    integrityDeltaCents: s.integrityDeltaCents,
    chainOk: s.chainOk,
    chainExpectedCents: s.chainExpectedCents,
    previousStatementId: s.previousStatementId,
    fileUrl: s.mediaAsset?.publicUrl ?? null,
    fileName: s.mediaAsset?.fileName ?? null,
    warnings: s.error,
    unmatchedCount: counts.UNMATCHED ?? 0,
    suggestedCount: counts.SUGGESTED ?? 0,
    matchedCount: counts.MATCHED ?? 0,
    ignoredCount: counts.IGNORED ?? 0,
    createdAt: s.createdAt,
  };
}

function countsOf(lines: Array<{ status: BankStatementLineStatus }>): Counts {
  const c: Counts = {};
  for (const l of lines) c[l.status] = (c[l.status] ?? 0) + 1;
  return c;
}

export function toDetail(s: StatementDetailRow): BankStatementGraph {
  return { ...toListItem(s, countsOf(s.lines)), lines: s.lines.map(toLineGraph) };
}

function toCandidate(c: Candidate): BankLineCandidateGraph {
  return {
    entryId: c.entry.id,
    label: c.entry.label,
    occurredAt: c.entry.occurredAt,
    kind: c.entry.kind,
    source: c.entry.source,
    amountCents: c.entry.amountCents,
    remainingCents: c.remainingCents,
    strong: c.strong,
  };
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class BankImportResolver {
  constructor(
    private readonly statements: BankStatementService,
    private readonly reconciliation: BankReconciliationService,
  ) {}

  @Query(() => [ReconciliationAccountSummaryGraph], { name: 'clubReconciliationSummary' })
  async clubReconciliationSummary(
    @CurrentClub() club: Club,
  ): Promise<ReconciliationAccountSummaryGraph[]> {
    const rows = await this.statements.summary(club.id);
    return rows.map((r) => ({
      ...r,
      lastPeriodEnd: r.lastPeriodEnd ? formatIsoDate(r.lastPeriodEnd) : null,
    }));
  }

  @Query(() => [BankStatementListItemGraph], { name: 'clubBankStatements' })
  async clubBankStatements(
    @CurrentClub() club: Club,
    @Args('financialAccountId', { type: () => ID, nullable: true })
    financialAccountId: string | null,
  ): Promise<BankStatementListItemGraph[]> {
    const rows = await this.statements.list(club.id, financialAccountId);
    const counts = await this.statements.lineCounts(
      club.id,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toListItem(r, counts.get(r.id) ?? {}));
  }

  @Query(() => BankStatementGraph, { name: 'clubBankStatement' })
  async clubBankStatement(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BankStatementGraph> {
    return toDetail(await this.statements.getById(club.id, id));
  }

  @Query(() => [BankLineCandidateGraph], {
    name: 'bankLineCandidates',
    description:
      'Écritures plausibles pour rapprocher une ligne à la main : même compte, fenêtre large, tout montant, pas encore entièrement rapprochées.',
  })
  async bankLineCandidates(
    @CurrentClub() club: Club,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankLineCandidateGraph[]> {
    const rows = await this.reconciliation.candidatesForLine(club.id, lineId);
    return rows.map(toCandidate);
  }

  @Mutation(() => CsvPreviewGraph, {
    name: 'previewCsvStatement',
    description: 'Détecte le mapping de colonnes d’un CSV et rend un aperçu, sans rien importer.',
  })
  previewCsvStatement(
    @CurrentClub() _club: Club,
    @Args('input') input: PreviewCsvStatementInput,
  ): CsvPreviewGraph {
    const r = this.statements.previewCsv(
      input.contentBase64,
      input.mapping ? toMapping(input.mapping) : null,
    );
    return {
      delimiter: r.detection.delimiter,
      encoding: r.detection.encoding,
      hasHeader: r.detection.hasHeader,
      headers: r.detection.headers,
      sampleRows: r.detection.sampleRows,
      rowCount: r.detection.rowCount,
      mapping: r.mapping,
      parsedCount: r.parsed?.lines.length ?? 0,
      previewLines: (r.parsed?.lines ?? []).slice(0, 10).map((l) => ({
        bookedOn: formatIsoDate(l.bookedOn),
        label: l.label,
        amountCents: l.amountCents,
        balanceAfterCents: l.balanceAfterCents,
      })),
      openingBalanceCents: r.parsed?.openingBalanceCents ?? null,
      closingBalanceCents: r.parsed?.closingBalanceCents ?? null,
      periodStart: r.parsed?.periodStart ? formatIsoDate(r.parsed.periodStart) : null,
      periodEnd: r.parsed?.periodEnd ? formatIsoDate(r.parsed.periodEnd) : null,
      warnings: r.parsed?.warnings ?? [],
      error: r.error,
    };
  }

  @Mutation(() => BankStatementGraph, {
    name: 'importBankStatement',
    description:
      'Dépose un relevé OFX ou CSV : lecture, contrôle d’intégrité (soldes, chaînage, non-chevauchement), puis rapprochement automatique s’il est exploitable.',
  })
  async importBankStatement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ImportBankStatementInput,
  ): Promise<BankStatementGraph> {
    const row = await this.statements.import(club.id, user.userId, {
      financialAccountId: input.financialAccountId,
      format: input.format === 'OFX' ? 'OFX' : 'CSV',
      fileName: input.fileName,
      contentBase64: input.contentBase64,
      csvMapping: input.csvMapping ? toMapping(input.csvMapping) : null,
      openingBalanceCents: input.openingBalanceCents ?? null,
      closingBalanceCents: input.closingBalanceCents ?? null,
      periodStart: input.periodStart ? parseIsoDate(input.periodStart) : null,
      periodEnd: input.periodEnd ? parseIsoDate(input.periodEnd) : null,
    });
    return toDetail(row);
  }

  @Mutation(() => BankStatementGraph, { name: 'updateBankStatementLine' })
  async updateBankStatementLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateBankStatementLineInput,
  ): Promise<BankStatementGraph> {
    const row = await this.statements.updateLine(club.id, user.userId, {
      lineId: input.lineId,
      bookedOn: input.bookedOn ? parseIsoDate(input.bookedOn) : null,
      label: input.label ?? null,
      amountCents: input.amountCents ?? null,
    });
    return toDetail(row);
  }

  @Mutation(() => BankStatementGraph, { name: 'addBankStatementLine' })
  async addBankStatementLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AddBankStatementLineInput,
  ): Promise<BankStatementGraph> {
    const row = await this.statements.addLine(club.id, user.userId, {
      statementId: input.statementId,
      bookedOn: parseIsoDate(input.bookedOn),
      label: input.label,
      amountCents: input.amountCents,
    });
    return toDetail(row);
  }

  @Mutation(() => BankStatementGraph, { name: 'removeBankStatementLine' })
  async removeBankStatementLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankStatementGraph> {
    return toDetail(await this.statements.removeLine(club.id, user.userId, lineId));
  }

  @Mutation(() => Boolean, { name: 'deleteBankStatement' })
  async deleteBankStatement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.statements.delete(club.id, user.userId, id);
  }

  @Mutation(() => BankStatementGraph, { name: 'autoMatchBankStatement' })
  async autoMatchBankStatement(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BankStatementGraph> {
    await this.reconciliation.autoMatch(club.id, id);
    return toDetail(await this.statements.getById(club.id, id));
  }

  @Mutation(() => BankStatementLineGraph, { name: 'matchBankLine' })
  async matchBankLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: MatchBankLineInput,
  ): Promise<BankStatementLineGraph> {
    const line = await this.reconciliation.match(
      club.id,
      user.userId,
      input.lineId,
      input.allocations.map((a) => ({ entryId: a.entryId, amountCents: a.amountCents })),
    );
    return toLineGraph(line);
  }

  @Mutation(() => BankStatementLineGraph, { name: 'unmatchBankLine' })
  async unmatchBankLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankStatementLineGraph> {
    return toLineGraph(await this.reconciliation.unmatch(club.id, user.userId, lineId));
  }

  @Mutation(() => BankStatementLineGraph, { name: 'ignoreBankLine' })
  async ignoreBankLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: IgnoreBankLineInput,
  ): Promise<BankStatementLineGraph> {
    return toLineGraph(
      await this.reconciliation.ignore(club.id, user.userId, input.lineId, input.reason, input.note),
    );
  }

  @Mutation(() => BankStatementLineGraph, { name: 'unignoreBankLine' })
  async unignoreBankLine(
    @CurrentClub() club: Club,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankStatementLineGraph> {
    return toLineGraph(await this.reconciliation.unignore(club.id, lineId));
  }
}
