import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { BankStatementLineStatus } from '@prisma/client';
import { BankLineCategorizationService } from './bank-line-categorization.service';
import { BankPayerLookupService } from './bank-payer-lookup.service';
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
  StatementLineCounts,
  StatementDetailRow,
  StatementListRow,
} from './bank-statement.service';
import type { CsvMapping } from './csv-parser';
import {
  AcceptBankLineProposalInput,
  AddBankStatementLineInput,
  AnswerBankLineQuestionInput,
  CsvMappingInput,
  IgnoreBankLineInput,
  ImportBankStatementInput,
  MatchBankLineInput,
  PreviewCsvStatementInput,
  UpdateBankStatementBalancesInput,
  UpdateBankStatementLineInput,
  UpsertCategorizationRuleInput,
} from './dto/bank-import.input';
import type { LineDivergence } from './merge-readings';
import {
  BankLineCandidateGraph,
  BankLineDivergenceGraph,
  BankLineProposalGraph,
  BankPayerCandidateGraph,
  BankStatementGraph,
  BankStatementLineGraph,
  BankStatementListItemGraph,
  CategorizationRuleGraph,
  CsvPreviewGraph,
  ReconciliationAccountSummaryGraph,
} from './models/bank-statement.model';

type Counts = StatementLineCounts;

const EMPTY_COUNTS: Counts = { proposalCount: 0, questionCount: 0, toCategorizeCount: 0 };

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

function divergenceFromJson(raw: unknown): BankLineDivergenceGraph | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<LineDivergence>;
  if (typeof d.kind !== 'string') return null;
  const side = (s: LineDivergence['a']): BankLineDivergenceGraph['a'] =>
    s && typeof s === 'object'
      ? { bookedOn: s.bookedOn, label: s.label, amountCents: s.amountCents }
      : null;
  return { kind: d.kind, a: side(d.a ?? null), b: side(d.b ?? null) };
}

/**
 * La proposition est stockée en JSON sur la ligne : on la relit en la
 * validant, pour qu'une donnée écrite par une version antérieure ne fasse
 * pas tomber toute la requête.
 */
function proposalGraph(raw: unknown): BankLineProposalGraph | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.accountCode !== 'string') return null;
  return {
    accountCode: p.accountCode,
    accountLabel: typeof p.accountLabel === 'string' ? p.accountLabel : '',
    projectId: typeof p.projectId === 'string' ? p.projectId : null,
    projectTitle: typeof p.projectTitle === 'string' ? p.projectTitle : null,
    label: typeof p.label === 'string' ? p.label : '',
    confidencePct: typeof p.confidencePct === 'number' ? p.confidencePct : 0,
    source: p.source === 'RULE' ? 'RULE' : 'AI',
    ruleId: typeof p.ruleId === 'string' ? p.ruleId : null,
    reasoning: typeof p.reasoning === 'string' ? p.reasoning : null,
    models: Array.isArray(p.models) ? p.models.filter((m): m is string => typeof m === 'string') : [],
    clear: p.clear === true,
  };
}

function conversationGraph(raw: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map((t) => ({
      role: t.role === 'USER' ? 'USER' : 'ASSISTANT',
      text: typeof t.text === 'string' ? t.text : '',
    }))
    .filter((t) => t.text.length > 0);
}

/**
 * Le virement reconnu est stocké en JSON sur la ligne : relu en validant,
 * pour qu'une donnée d'une version antérieure ne fasse pas tomber la requête.
 */
function payerGraph(raw: unknown): BankPayerCandidateGraph | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  const payer = p.payer as Record<string, unknown> | undefined;
  if (!payer || typeof payer.id !== 'string') return null;
  const invoices = Array.isArray(p.invoices) ? p.invoices : [];
  const allocations = Array.isArray(p.allocations) ? p.allocations : [];
  return {
    payer: {
      kind: payer.kind === 'CONTACT' ? 'CONTACT' : 'MEMBER',
      id: payer.id,
      firstName: typeof payer.firstName === 'string' ? payer.firstName : '',
      lastName: typeof payer.lastName === 'string' ? payer.lastName : '',
    },
    nameScore: typeof p.nameScore === 'number' ? p.nameScore : 0,
    amountMatch: typeof p.amountMatch === 'string' ? p.amountMatch : 'NONE',
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
    invoices: invoices
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map((i) => ({
        id: String(i.id ?? ''),
        label: typeof i.label === 'string' ? i.label : '',
        amountCents: typeof i.amountCents === 'number' ? i.amountCents : 0,
        balanceCents: typeof i.balanceCents === 'number' ? i.balanceCents : 0,
        dueAt: typeof i.dueAt === 'string' ? i.dueAt.slice(0, 10) : null,
      })),
    allocations: allocations
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map((a) => ({
        invoiceId: String(a.invoiceId ?? ''),
        amountCents: typeof a.amountCents === 'number' ? a.amountCents : 0,
      })),
  };
}

export function toLineGraph(l: LineRow): BankStatementLineGraph {
  return {
    proposal: proposalGraph(l.aiProposalJson),
    proposedEntryId: l.proposedEntryId,
    question: l.aiQuestion,
    conversation: conversationGraph(l.aiConversationJson),
    aiAttempts: l.aiAttempts,
    aiExhausted: l.aiExhausted,
    payerProposal: payerGraph(l.payerProposalJson),
    readingAgreement: l.readingAgreement,
    divergence: divergenceFromJson(l.divergenceJson),
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
    divergenceCount: s._count.lines,
    proposalCount: counts.proposalCount,
    questionCount: counts.questionCount,
    toCategorizeCount: counts.toCategorizeCount,
    readingModelA: s.readingModelA,
    readingModelB: s.readingModelB,
    aiCostCents: s.aiCostCents,
    createdAt: s.createdAt,
  };
}

function countsOf(
  lines: Array<{
    status: BankStatementLineStatus;
    proposedEntryId: string | null;
    aiQuestion: string | null;
    aiExhausted: boolean;
  }>,
): Counts {
  const c: Counts = { proposalCount: 0, questionCount: 0, toCategorizeCount: 0 };
  for (const l of lines) {
    c[l.status] = (c[l.status] ?? 0) + 1;
    if (l.status !== BankStatementLineStatus.UNMATCHED) continue;
    if (l.proposedEntryId) c.proposalCount++;
    else if (l.aiQuestion) c.questionCount++;
    else if (!l.aiExhausted) c.toCategorizeCount++;
  }
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
    private readonly categorization: BankLineCategorizationService,
    private readonly payerLookup: BankPayerLookupService,
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
    return rows.map((r) => toListItem(r, counts.get(r.id) ?? EMPTY_COUNTS));
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


  @Query(() => [BankPayerCandidateGraph], {
    name: 'bankLinePayerCandidates',
    description:
      'Adhérents ou contacts qui ont pu émettre ce virement, avec les factures ouvertes que le montant solderait.',
  })
  async bankLinePayerCandidates(
    @CurrentClub() club: Club,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankPayerCandidateGraph[]> {
    const rows = await this.payerLookup.payerCandidates(club.id, lineId);
    return rows.map((c) => ({
      payer: {
        kind: c.payer.kind,
        id: c.payer.id,
        firstName: c.payer.firstName,
        lastName: c.payer.lastName,
      },
      nameScore: c.nameScore,
      amountMatch: c.amountMatch,
      confidence: c.confidence,
      invoices: c.invoices.map((i) => ({
        id: i.id,
        label: i.label,
        amountCents: i.amountCents,
        balanceCents: i.balanceCents,
        dueAt: i.dueAt ? formatIsoDate(i.dueAt) : null,
      })),
      allocations: c.allocations,
    }));
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
      'Dépose un relevé OFX, CSV ou PDF : lecture (deux modèles en arrière-plan pour un PDF, statut PARSING), contrôle d’intégrité (soldes, chaînage, non-chevauchement), puis rapprochement automatique s’il est exploitable.',
  })
  async importBankStatement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ImportBankStatementInput,
  ): Promise<BankStatementGraph> {
    const row = await this.statements.import(club.id, user.userId, {
      financialAccountId: input.financialAccountId,
      format: input.format === 'OFX' ? 'OFX' : input.format === 'PDF' ? 'PDF' : 'CSV',
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

  @Mutation(() => BankStatementGraph, {
    name: 'rerunBankStatementReading',
    description: 'Relit un relevé PDF par les deux modèles (statut PARSING pendant la lecture).',
  })
  async rerunBankStatementReading(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BankStatementGraph> {
    return toDetail(await this.statements.rerunReading(club.id, user.userId, id));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'confirmBankStatementLineReading',
    description: 'Tranche une divergence entre les deux lectures : la ligne est gardée telle quelle.',
  })
  async confirmBankStatementLineReading(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankStatementGraph> {
    return toDetail(await this.statements.confirmLineReading(club.id, user.userId, lineId));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'updateBankStatementBalances',
    description: 'Corrige les soldes de début et de fin ; le contrôle est relancé (et le chaînage des suivants).',
  })
  async updateBankStatementBalances(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpdateBankStatementBalancesInput,
  ): Promise<BankStatementGraph> {
    return toDetail(
      await this.statements.updateBalances(club.id, user.userId, {
        statementId: input.statementId,
        openingBalanceCents: input.openingBalanceCents,
        closingBalanceCents: input.closingBalanceCents,
      }),
    );
  }

  @Mutation(() => BankStatementGraph, {
    name: 'recheckBankStatement',
    description: 'Relance le contrôle d’intégrité et le chaînage d’un relevé.',
  })
  async recheckBankStatement(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BankStatementGraph> {
    await this.statements.recomputeIntegrity(club.id, id);
    return toDetail(await this.statements.getById(club.id, id));
  }

  // ── Catégorisation des lignes sans écriture (ADR-0014 §5) ─────────────

  @Mutation(() => BankStatementGraph, {
    name: 'categorizeBankLine',
    description:
      'Propose un compte pour une ligne sans écriture : règle du club, sinon deux modèles, sinon une question.',
  })
  async categorizeBankLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankStatementGraph> {
    await this.categorization.categorizeLine(club.id, user.userId, lineId);
    const line = await this.reconciliation.loadLine(club.id, lineId);
    return toDetail(await this.statements.getById(club.id, line.statementId));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'categorizeBankStatement',
    description: 'Relance la catégorisation de toutes les lignes encore sans proposition.',
  })
  async categorizeBankStatement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BankStatementGraph> {
    await this.categorization.categorizeStatement(club.id, user.userId, id);
    return toDetail(await this.statements.getById(club.id, id));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'answerBankLineQuestion',
    description: 'Répond à la question posée sur une ligne ; la réflexion est relancée aussitôt.',
  })
  async answerBankLineQuestion(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AnswerBankLineQuestionInput,
  ): Promise<BankStatementGraph> {
    await this.categorization.answerQuestion(club.id, user.userId, input.lineId, input.answer);
    const line = await this.reconciliation.loadLine(club.id, input.lineId);
    return toDetail(await this.statements.getById(club.id, line.statementId));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'acceptBankLineProposal',
    description:
      'Valide la proposition : l’écriture est comptabilisée, la ligne rapprochée, et la décision devient une règle.',
  })
  async acceptBankLineProposal(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AcceptBankLineProposalInput,
  ): Promise<BankStatementGraph> {
    const line = await this.reconciliation.loadLine(club.id, input.lineId);
    await this.categorization.accept(club.id, user.userId, input.lineId, {
      accountCode: input.accountCode ?? null,
      projectId: input.projectId === undefined ? undefined : input.projectId,
      label: input.label ?? null,
    });
    return toDetail(await this.statements.getById(club.id, line.statementId));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'rejectBankLineProposal',
    description: 'Rejette la proposition : son écriture est supprimée, la ligne reste à traiter.',
  })
  async rejectBankLineProposal(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<BankStatementGraph> {
    const line = await this.reconciliation.loadLine(club.id, lineId);
    await this.categorization.reject(club.id, user.userId, lineId);
    return toDetail(await this.statements.getById(club.id, line.statementId));
  }

  @Mutation(() => BankStatementGraph, {
    name: 'bulkAcceptBankLineProposals',
    description:
      'Valide en lot ; les propositions qui ne sont pas sûres sont écartées, revérification faite côté serveur.',
  })
  async bulkAcceptBankLineProposals(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('statementId', { type: () => ID }) statementId: string,
    @Args('lineIds', { type: () => [ID] }) lineIds: string[],
  ): Promise<BankStatementGraph> {
    await this.categorization.bulkAccept(club.id, user.userId, lineIds);
    return toDetail(await this.statements.getById(club.id, statementId));
  }

  @Query(() => [CategorizationRuleGraph], { name: 'clubCategorizationRules' })
  async clubCategorizationRules(@CurrentClub() club: Club): Promise<CategorizationRuleGraph[]> {
    const rules = await this.categorization.listRules(club.id);
    return this.withAccountLabels(club.id, rules);
  }

  @Mutation(() => [CategorizationRuleGraph], { name: 'upsertCategorizationRule' })
  async upsertCategorizationRule(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: UpsertCategorizationRuleInput,
  ): Promise<CategorizationRuleGraph[]> {
    await this.categorization.upsertRule(club.id, user.userId, {
      id: input.id ?? null,
      pattern: input.pattern,
      matchKind: input.matchKind,
      direction: input.direction,
      accountCode: input.accountCode,
      projectId: input.projectId ?? null,
      label: input.label ?? null,
      isActive: input.isActive ?? null,
    });
    return this.withAccountLabels(club.id, await this.categorization.listRules(club.id));
  }

  @Mutation(() => [CategorizationRuleGraph], { name: 'deleteCategorizationRule' })
  async deleteCategorizationRule(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CategorizationRuleGraph[]> {
    await this.categorization.deleteRule(club.id, id);
    return this.withAccountLabels(club.id, await this.categorization.listRules(club.id));
  }

  /** Le libellé du compte visé, pour que la liste des règles se lise sans décoder. */
  private async withAccountLabels(
    clubId: string,
    rules: Array<Omit<CategorizationRuleGraph, 'accountLabel'>>,
  ): Promise<CategorizationRuleGraph[]> {
    const labels = await this.statements.accountLabels(
      clubId,
      rules.map((r) => r.accountCode),
    );
    return rules.map((r) => ({ ...r, accountLabel: labels.get(r.accountCode) ?? null }));
  }
}
