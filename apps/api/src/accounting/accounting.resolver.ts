import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import {
  AccountingAccountKind,
  AccountingDocumentKind,
  AccountingEntrySource,
  AccountingEntryStatus,
} from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import type { RequestUser } from '../common/types/request-user';
import { AccountingAllocationService } from './accounting-allocation.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingConsolidationService } from './accounting-consolidation.service';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingSeedService } from './accounting-seed.service';
import { AccountingService } from './accounting.service';
import { AccountingSuggestionService } from './accounting-suggestion.service';
import { ClubFinancialAccountsService } from './club-financial-accounts.service';
import { ClubPaymentRoutesService } from './club-payment-routes.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { CancelAccountingEntryInput } from './dto/cancel-accounting-entry.input';
import {
  CreateClubFinancialAccountInput,
  UpdateClubFinancialAccountInput,
} from './dto/club-financial-account.input';
import { UpsertClubPaymentRouteInput } from './dto/club-payment-route.input';
import { ConfirmExtractionInput } from './dto/confirm-extraction.input';
import { CreateAccountingEntryInput } from './dto/create-accounting-entry.input';
import { CreateQuickAccountingEntryInput } from './dto/create-quick-entry.input';
import {
  AccountingAccountGraph,
  AccountingAccountMappingGraph,
} from './models/accounting-account.model';
import { AccountingCohortGraph } from './models/accounting-cohort.model';
import {
  AccountingAllocationGraph,
  AccountingDocumentGraph,
  AccountingEntryGraph,
  AccountingEntryLineGraph,
  AccountingExtractionGraph,
} from './models/accounting-entry.model';
import { AccountingSuggestionGraph } from './models/accounting-suggestion.model';
import { AccountingSummaryGraph } from './models/accounting-summary.model';
import { ClubFinancialAccountGraph } from './models/club-financial-account.model';
import { ClubPaymentRouteGraph } from './models/club-payment-route.model';
import { ConsolidationPreviewGraph } from './models/consolidation-preview.model';
import { QuickEntryResultGraph } from './models/quick-entry-result.model';
import { ReceiptOcrResultGraph } from './models/receipt-ocr-result.model';
import { SuggestAccountingCategorizationInput } from './dto/suggest-accounting-categorization.input';

interface EntryRow {
  id: string;
  clubId: string;
  kind: AccountingEntryGraph['kind'];
  status: AccountingEntryStatus;
  source: AccountingEntrySource;
  label: string;
  amountCents: number;
  vatTotalCents: number | null;
  paymentId: string | null;
  projectId: string | null;
  contraEntryId: string | null;
  financialAccountId: string | null;
  financialAccount: {
    id: string;
    label: string;
    accountingAccount: { code: string };
  } | null;
  consolidatedAt: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  aiProcessingStartedAt: Date | null;
  invoiceNumber: string | null;
  duplicateOfEntryId: string | null;
  occurredAt: Date;
  createdAt: Date;
  lines: Array<{
    id: string;
    accountCode: string;
    accountLabel: string;
    label: string | null;
    side: AccountingEntryLineGraph['side'];
    debitCents: number;
    creditCents: number;
    vatRate: { toNumber: () => number } | null;
    vatAmountCents: number | null;
    validatedAt: Date | null;
    iaSuggestedAccountCode: string | null;
    iaReasoning: string | null;
    iaConfidencePct: number | null;
    mergedFromArticleLabels: string[];
    allocations: Array<{
      id: string;
      amountCents: number;
      projectId: string | null;
      project: { id: string; title: string } | null;
      cohortCode: string | null;
      gender: AccountingAllocationGraph['gender'];
      disciplineCode: string | null;
      memberId: string | null;
      member?: { firstName: string; lastName: string } | null;
      dynamicGroupLabelsSnapshot: string[];
      freeformTags: string[];
    }>;
  }>;
  documents: Array<{
    id: string;
    mediaAssetId: string;
    mediaAsset: { fileName: string; publicUrl: string; mimeType: string };
  }>;
  extraction?: {
    id: string;
    extractedVendor: string | null;
    extractedInvoiceNumber: string | null;
    extractedTotalCents: number | null;
    extractedVatCents: number | null;
    extractedDate: Date | null;
    extractedAccountCode: string | null;
    confidencePerField: unknown;
    categorizationJson: unknown;
    model: string | null;
    error: string | null;
  } | null;
}

function toGraph(entry: EntryRow): AccountingEntryGraph {
  return {
    id: entry.id,
    clubId: entry.clubId,
    kind: entry.kind,
    status: entry.status,
    source: entry.source,
    label: entry.label,
    amountCents: entry.amountCents,
    vatTotalCents: entry.vatTotalCents,
    paymentId: entry.paymentId,
    projectId: entry.projectId,
    contraEntryId: entry.contraEntryId,
    financialAccountId: entry.financialAccountId,
    financialAccountLabel: entry.financialAccount?.label ?? null,
    financialAccountCode:
      entry.financialAccount?.accountingAccount.code ?? null,
    consolidatedAt: entry.consolidatedAt,
    paymentMethod: entry.paymentMethod,
    paymentReference: entry.paymentReference,
    aiProcessingStartedAt: entry.aiProcessingStartedAt,
    invoiceNumber: entry.invoiceNumber,
    duplicateOfEntryId: entry.duplicateOfEntryId,
    occurredAt: entry.occurredAt,
    createdAt: entry.createdAt,
    lines: entry.lines.map(
      (l): AccountingEntryLineGraph => ({
        id: l.id,
        accountCode: l.accountCode,
        accountLabel: l.accountLabel,
        label: l.label,
        side: l.side,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        vatRate: l.vatRate ? l.vatRate.toNumber() : null,
        vatAmountCents: l.vatAmountCents,
        validatedAt: l.validatedAt,
        iaSuggestedAccountCode: l.iaSuggestedAccountCode,
        iaReasoning: l.iaReasoning,
        iaConfidencePct: l.iaConfidencePct,
        mergedFromArticleLabels: l.mergedFromArticleLabels,
        allocations: l.allocations.map(
          (a): AccountingAllocationGraph => ({
            id: a.id,
            amountCents: a.amountCents,
            projectId: a.projectId,
            projectTitle: a.project?.title ?? null,
            cohortCode: a.cohortCode,
            gender: a.gender,
            disciplineCode: a.disciplineCode,
            memberId: a.memberId,
            memberName: a.member
              ? `${a.member.firstName} ${a.member.lastName}`
              : null,
            dynamicGroupLabels: a.dynamicGroupLabelsSnapshot,
            freeformTags: a.freeformTags,
          }),
        ),
      }),
    ),
    documents: entry.documents.map(
      (d): AccountingDocumentGraph => ({
        id: d.id,
        mediaAssetId: d.mediaAssetId,
        fileName: d.mediaAsset.fileName,
        publicUrl: d.mediaAsset.publicUrl,
        mimeType: d.mediaAsset.mimeType,
      }),
    ),
    extraction: entry.extraction
      ? ({
          id: entry.extraction.id,
          extractedVendor: entry.extraction.extractedVendor,
          extractedInvoiceNumber: entry.extraction.extractedInvoiceNumber,
          extractedTotalCents: entry.extraction.extractedTotalCents,
          extractedVatCents: entry.extraction.extractedVatCents,
          extractedDate: entry.extraction.extractedDate,
          extractedAccountCode: entry.extraction.extractedAccountCode,
          confidencePerFieldJson:
            entry.extraction.confidencePerField != null
              ? JSON.stringify(entry.extraction.confidencePerField)
              : null,
          categorizationJson:
            entry.extraction.categorizationJson != null
              ? JSON.stringify(entry.extraction.categorizationJson)
              : null,
          model: entry.extraction.model,
          error: entry.extraction.error,
        } satisfies AccountingExtractionGraph)
      : null,
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
export class AccountingResolver {
  constructor(
    private readonly accounting: AccountingService,
    private readonly allocationService: AccountingAllocationService,
    private readonly mappingService: AccountingMappingService,
    private readonly periodService: AccountingPeriodService,
    private readonly auditService: AccountingAuditService,
    private readonly receiptOcr: ReceiptOcrService,
    private readonly seedService: AccountingSeedService,
    private readonly suggestionService: AccountingSuggestionService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly paymentRoutes: ClubPaymentRoutesService,
    private readonly consolidation: AccountingConsolidationService,
  ) {}

  // =========================================================================
  // Queries
  // =========================================================================

  @Query(() => [AccountingEntryGraph], { name: 'clubAccountingEntries' })
  async clubAccountingEntries(
    @CurrentClub() club: Club,
    @Args('from', { type: () => Date, nullable: true }) from: Date | null,
    @Args('to', { type: () => Date, nullable: true }) to: Date | null,
    @Args('projectId', { type: () => ID, nullable: true })
    projectId: string | null,
    @Args('cohortCode', { type: () => String, nullable: true })
    cohortCode: string | null,
    @Args('status', { type: () => AccountingEntryStatus, nullable: true })
    status: AccountingEntryStatus | null,
    @Args('source', { type: () => AccountingEntrySource, nullable: true })
    source: AccountingEntrySource | null,
    @Args('accountCode', { type: () => String, nullable: true })
    accountCode: string | null,
    @Args('financialAccountId', { type: () => ID, nullable: true })
    financialAccountId: string | null,
  ): Promise<AccountingEntryGraph[]> {
    const rows = await this.accounting.listEntries(club.id, {
      from,
      to,
      projectId,
      cohortCode,
      status,
      source,
      accountCode,
      financialAccountId,
    });
    return (rows as unknown as EntryRow[]).map(toGraph);
  }

  @Query(() => AccountingEntryGraph, { name: 'clubAccountingEntry' })
  async clubAccountingEntry(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AccountingEntryGraph> {
    const r = await this.accounting.getEntry(club.id, id);
    return toGraph(r as unknown as EntryRow);
  }

  @Query(() => [AccountingEntryGraph], { name: 'clubAccountingReviewQueue' })
  async clubAccountingReviewQueue(
    @CurrentClub() club: Club,
  ): Promise<AccountingEntryGraph[]> {
    const rows = await this.accounting.listReviewQueue(club.id);
    // reviewQueue include est lighter — on récupère le détail complet
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const full = await this.accounting.listEntries(club.id, { limit: 500 });
    return (full as unknown as EntryRow[])
      .filter((r) => ids.includes(r.id))
      .map(toGraph);
  }

  @Query(() => AccountingSummaryGraph, { name: 'clubAccountingSummary' })
  clubAccountingSummary(
    @CurrentClub() club: Club,
    @Args('from', { type: () => Date, nullable: true }) from: Date | null,
    @Args('to', { type: () => Date, nullable: true }) to: Date | null,
  ): Promise<AccountingSummaryGraph> {
    return this.accounting.summary(club.id, { from, to });
  }

  @Query(() => [AccountingAccountGraph], { name: 'clubAccountingAccounts' })
  async clubAccountingAccounts(
    @CurrentClub() club: Club,
  ): Promise<AccountingAccountGraph[]> {
    // Top-up systématique : `seedIfEmpty` est idempotent (upsert par code),
    // et ne crée que les comptes manquants. On l'appelle à chaque query
    // pour garantir que les nouveaux comptes ajoutés dans des commits
    // ultérieurs (ex : immobilisations classe 2 ajoutées après le premier
    // seed) apparaissent pour les clubs existants, sans avoir à cliquer
    // sur le bouton "Initialiser le plan".
    await this.seedService.seedIfEmpty(club.id);
    const rows = await this.mappingService.listAccounts(club.id);
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      kind: r.kind as AccountingAccountKind,
      isDefault: r.isDefault,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    }));
  }

  @Query(() => [AccountingCohortGraph], { name: 'clubAccountingCohorts' })
  async clubAccountingCohorts(
    @CurrentClub() club: Club,
  ): Promise<AccountingCohortGraph[]> {
    let rows = await this.periodService.listCohorts(club.id);
    if (rows.length === 0) {
      await this.seedService.seedIfEmpty(club.id);
      rows = await this.periodService.listCohorts(club.id);
    }
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      minAge: r.minAge,
      maxAge: r.maxAge,
      sortOrder: r.sortOrder,
      isDefault: r.isDefault,
    }));
  }

  @Query(() => [AccountingAccountMappingGraph], {
    name: 'clubAccountingAccountMappings',
  })
  async clubAccountingAccountMappings(
    @CurrentClub() club: Club,
  ): Promise<AccountingAccountMappingGraph[]> {
    const rows = await this.mappingService.listMappings(club.id);
    return rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      accountCode: r.accountCode,
    }));
  }

  // =========================================================================
  // Mutations
  // =========================================================================

  @Mutation(() => AccountingEntryGraph, { name: 'createClubAccountingEntry' })
  async createClubAccountingEntry(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateAccountingEntryInput,
  ): Promise<AccountingEntryGraph> {
    await this.accounting.createManualEntry(club.id, user.userId, {
      kind: input.kind,
      label: input.label,
      accountCode: input.accountCode,
      amountCents: input.amountCents,
      occurredAt: input.occurredAt,
      projectId: input.projectId ?? null,
      cohortCode: input.cohortCode ?? null,
      disciplineCode: input.disciplineCode ?? null,
      freeformTags: input.freeformTags ?? [],
      documentMediaAssetIds: input.documentMediaAssetIds ?? [],
      vatAmountCents: input.vatAmountCents ?? null,
      financialAccountId: input.financialAccountId ?? null,
    });
    // Récupère l'entry pleine pour le retour
    const latest = await this.accounting.listEntries(club.id, {
      limit: 1,
    });
    if (latest.length === 0) {
      throw new Error('Création échouée');
    }
    return toGraph(latest[0] as unknown as EntryRow);
  }

  @Mutation(() => AccountingEntryGraph, { name: 'cancelClubAccountingEntry' })
  async cancelClubAccountingEntry(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CancelAccountingEntryInput,
  ): Promise<AccountingEntryGraph> {
    await this.accounting.cancelEntry(
      club.id,
      user.userId,
      input.id,
      input.reason,
    );
    const entry = await this.accounting.getEntry(club.id, input.id);
    return toGraph(entry as unknown as EntryRow);
  }

  @Mutation(() => AccountingEntryGraph, {
    name: 'createClubAccountingContraEntry',
  })
  async createClubAccountingContraEntry(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CancelAccountingEntryInput,
  ): Promise<AccountingEntryGraph> {
    const contra = await this.accounting.createContraEntry(
      club.id,
      user.userId,
      input.id,
      input.reason,
    );
    const entry = await this.accounting.getEntry(club.id, contra.id);
    return toGraph(entry as unknown as EntryRow);
  }

  @Mutation(() => Boolean, { name: 'attachClubAccountingDocument' })
  async attachClubAccountingDocument(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('entryId', { type: () => ID }) entryId: string,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
    @Args('kind', {
      type: () => AccountingDocumentKind,
      nullable: true,
    })
    kind: AccountingDocumentKind | null,
  ): Promise<boolean> {
    await this.accounting.attachDocument(
      club.id,
      user.userId,
      entryId,
      mediaAssetId,
      kind ?? AccountingDocumentKind.RECEIPT,
    );
    return true;
  }

  @Mutation(() => Boolean, { name: 'detachClubAccountingDocument' })
  async detachClubAccountingDocument(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('documentId', { type: () => ID }) documentId: string,
  ): Promise<boolean> {
    return this.accounting.detachDocument(club.id, user.userId, documentId);
  }

  @Mutation(() => Boolean, { name: 'lockClubAccountingMonth' })
  async lockClubAccountingMonth(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('month') month: string,
  ): Promise<boolean> {
    await this.periodService.lockMonth(club.id, month, user.userId);
    return true;
  }

  @Mutation(() => Boolean, { name: 'unlockClubAccountingMonth' })
  async unlockClubAccountingMonth(
    @CurrentClub() club: Club,
    @Args('month') month: string,
  ): Promise<boolean> {
    await this.periodService.unlockMonth(club.id, month);
    return true;
  }

  @Mutation(() => Boolean, { name: 'closeClubAccountingFiscalYear' })
  async closeClubAccountingFiscalYear(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('year') year: number,
  ): Promise<boolean> {
    await this.periodService.closeFiscalYear(club.id, year, user.userId);
    return true;
  }

  /**
   * Création "rapide" : entry créée immédiatement en NEEDS_REVIEW avec
   * compte fallback, l'IA catégorise en background et met à jour le
   * compte quand elle a fini (~2-5s). L'utilisateur n'attend pas.
   */
  @Mutation(() => QuickEntryResultGraph, {
    name: 'createClubAccountingEntryQuick',
  })
  async createClubAccountingEntryQuick(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateQuickAccountingEntryInput,
  ): Promise<QuickEntryResultGraph> {
    const result = await this.accounting.createQuickEntry(club.id, user.userId, {
      kind: input.kind,
      label: input.label,
      amountCents: input.amountCents,
      occurredAt: input.occurredAt,
      projectId: input.projectId ?? null,
      cohortCode: input.cohortCode ?? null,
      disciplineCode: input.disciplineCode ?? null,
      freeformTags: input.freeformTags ?? [],
      documentMediaAssetIds: input.documentMediaAssetIds ?? [],
      vatAmountCents: input.vatAmountCents ?? null,
      financialAccountId: input.financialAccountId ?? null,
      articles: input.articles?.map((a) => ({
        label: a.label,
        amountCents: a.amountCents,
        accountCode: a.accountCode ?? null,
        // Override analytique par article (cas facture mixte)
        projectId: a.projectId ?? null,
        cohortCode: a.cohortCode ?? null,
        disciplineCode: a.disciplineCode ?? null,
      })),
    });
    return {
      id: result.id,
      pendingCategorization: result.pendingCategorization,
    };
  }

  // =========================================================================
  // Suggestion IA de catégorisation (saisie manuelle)
  // =========================================================================

  @Mutation(() => AccountingSuggestionGraph, {
    name: 'suggestAccountingCategorization',
  })
  async suggestAccountingCategorization(
    @CurrentClub() club: Club,
    @Args('input') input: SuggestAccountingCategorizationInput,
  ): Promise<AccountingSuggestionGraph> {
    const result = await this.suggestionService.suggest(club.id, {
      label: input.label,
      amountCents: input.amountCents ?? null,
      kind:
        input.kind === 'INCOME' || input.kind === 'EXPENSE' ||
        input.kind === 'IN_KIND'
          ? input.kind
          : undefined,
    });
    return {
      accountCode: result.accountCode,
      accountLabel: result.accountLabel,
      cohortCode: result.cohortCode,
      projectId: result.projectId,
      projectTitle: result.projectTitle,
      disciplineCode: result.disciplineCode,
      confidenceAccount: result.confidencePerField.accountCode ?? null,
      confidenceCohort: result.confidencePerField.cohortCode ?? null,
      confidenceProject: result.confidencePerField.projectId ?? null,
      confidenceDiscipline: result.confidencePerField.disciplineCode ?? null,
      reasoning: result.reasoning,
      budgetBlocked: result.budgetBlocked,
      errorMessage: result.errorMessage,
    };
  }

  // =========================================================================
  // OCR IA — pipeline reçus/factures
  // =========================================================================

  @Mutation(() => ReceiptOcrResultGraph, { name: 'submitReceiptForOcr' })
  async submitReceiptForOcr(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
  ): Promise<ReceiptOcrResultGraph> {
    const result = await this.receiptOcr.extractFromMediaAsset(
      club.id,
      mediaAssetId,
      user.userId,
    );
    return {
      extractionId: result.extractionId || null,
      entryId: result.entryId,
      duplicateOfEntryId: result.duplicateOfEntryId,
      budgetBlocked: result.budgetBlocked,
    };
  }

  /**
   * Variante multi-pages : accepte plusieurs `mediaAssetId` (photos
   * d'une facture multi-pages OU mix images + PDF). L'IA voit toutes
   * les pages dans l'ordre fourni et produit UNE SEULE écriture +
   * extraction. Limite : 10 pages max par appel.
   */
  @Mutation(() => ReceiptOcrResultGraph, {
    name: 'submitMultiPageReceiptForOcr',
  })
  async submitMultiPageReceiptForOcr(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('mediaAssetIds', { type: () => [ID] }) mediaAssetIds: string[],
  ): Promise<ReceiptOcrResultGraph> {
    const result = await this.receiptOcr.extractFromMediaAssets(
      club.id,
      mediaAssetIds,
      user.userId,
    );
    return {
      extractionId: result.extractionId || null,
      entryId: result.entryId,
      duplicateOfEntryId: result.duplicateOfEntryId,
      budgetBlocked: result.budgetBlocked,
    };
  }

  @Mutation(() => AccountingEntryGraph, { name: 'confirmAccountingExtraction' })
  async confirmAccountingExtraction(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: ConfirmExtractionInput,
  ): Promise<AccountingEntryGraph> {
    await this.accounting.confirmExtraction(club.id, user.userId, input.entryId, {
      label: input.label,
      amountCents: input.amountCents,
      occurredAt: input.occurredAt,
      accountCode: input.accountCode,
      projectId: input.projectId ?? null,
      cohortCode: input.cohortCode ?? null,
      disciplineCode: input.disciplineCode ?? null,
      paymentMethod: input.paymentMethod ?? undefined,
      paymentReference: input.paymentReference ?? undefined,
      lineAmounts: input.lineAmounts,
      financialAccountId: input.financialAccountId,
      invoiceNumber: input.invoiceNumber,
      forceDuplicate: input.forceDuplicate ?? false,
      validate: input.validate ?? true,
      kind: 'EXPENSE' as const,
    });
    const entry = await this.accounting.getEntry(club.id, input.entryId);
    return toGraph(entry as unknown as EntryRow);
  }

  // =========================================================================
  // Validation granulaire par ligne
  // =========================================================================

  @Mutation(() => Boolean, { name: 'validateAccountingEntryLine' })
  async validateAccountingEntryLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
    @Args('accountCode', { type: () => String, nullable: true })
    accountCode: string | null,
  ): Promise<boolean> {
    await this.accounting.validateEntryLine(
      club.id,
      user.userId,
      lineId,
      accountCode ?? undefined,
    );
    return true;
  }

  @Mutation(() => Boolean, { name: 'unvalidateAccountingEntryLine' })
  async unvalidateAccountingEntryLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<boolean> {
    await this.accounting.unvalidateEntryLine(club.id, user.userId, lineId);
    return true;
  }

  /**
   * Édition post-création de la ventilation analytique d'une ligne.
   * Cas typique : facture mixte où on corrige après coup le projet
   * d'un article (ex : Tatamis → Coupe SKSR, Sifflet → reste fonc général).
   */
  @Mutation(() => Boolean, { name: 'updateAccountingLineAllocation' })
  async updateAccountingLineAllocation(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
    @Args('projectId', { type: () => ID, nullable: true })
    projectId: string | null,
    @Args('cohortCode', { type: () => String, nullable: true })
    cohortCode: string | null,
    @Args('disciplineCode', { type: () => String, nullable: true })
    disciplineCode: string | null,
  ): Promise<boolean> {
    await this.accounting.updateLineAllocation(club.id, user.userId, lineId, {
      projectId,
      cohortCode,
      disciplineCode,
    });
    return true;
  }

  /**
   * Relance manuelle de la catégorisation IA pour UNE ligne.
   * Nettoie les labels legacy, rappelle l'IA, met à jour la ligne.
   */
  @Mutation(() => AccountingSuggestionGraph, {
    name: 'rerunAccountingAiForLine',
  })
  async rerunAccountingAiForLine(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('lineId', { type: () => ID }) lineId: string,
  ): Promise<AccountingSuggestionGraph> {
    const r = await this.accounting.rerunAiForLine(
      club.id,
      user.userId,
      lineId,
    );
    // On retourne dans le format AccountingSuggestionGraph pour la cohérence
    // (le client affiche `reasoning`, `confidenceAccount`, `accountCode`).
    return {
      accountCode: r.accountCode,
      accountLabel: null,
      cohortCode: null,
      projectId: null,
      projectTitle: null,
      disciplineCode: null,
      confidenceAccount: r.confidencePct !== null ? r.confidencePct / 100 : null,
      confidenceCohort: null,
      confidenceProject: null,
      confidenceDiscipline: null,
      reasoning: r.reasoning,
      budgetBlocked: false,
      errorMessage: r.errorMessage,
    };
  }

  @Mutation(() => Boolean, { name: 'deleteClubAccountingEntryPermanent' })
  async deleteClubAccountingEntryPermanent(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.accounting.deleteEntryPermanent(club.id, user.userId, id);
  }

  // Mutation explicite de seed (fallback UI : bouton "Initialiser le plan")
  @Mutation(() => Boolean, { name: 'initClubAccountingPlan' })
  async initClubAccountingPlan(@CurrentClub() club: Club): Promise<boolean> {
    await this.seedService.seedIfEmpty(club.id);
    return true;
  }

  // Legacy compat mutation (ancienne UI)
  @Mutation(() => Boolean, { name: 'deleteClubAccountingEntry' })
  async deleteClubAccountingEntry(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.accounting.cancelEntry(
      club.id,
      user.userId,
      id,
      'delete-via-api',
    );
    return true;
  }

  // =========================================================================
  // Comptes financiers (banques, caisses, transit Stripe)
  // =========================================================================

  @Query(() => [ClubFinancialAccountGraph], {
    name: 'clubFinancialAccounts',
  })
  async clubFinancialAccounts(
    @CurrentClub() club: Club,
  ): Promise<ClubFinancialAccountGraph[]> {
    // Top-up idempotent : garantit qu'un club existant ait toujours
    // au moins ses 2 comptes par défaut (Banque + Caisse) seedés.
    await this.seedService.seedIfEmpty(club.id);
    const rows = await this.financialAccounts.listAll(club.id);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      accountingAccountId: r.accountingAccountId,
      accountingAccountCode: r.accountingAccount.code,
      accountingAccountLabel: r.accountingAccount.label,
      iban: r.iban,
      bic: r.bic,
      stripeAccountId: r.stripeAccountId,
      isDefault: r.isDefault,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      notes: r.notes,
    }));
  }

  @Mutation(() => ClubFinancialAccountGraph, {
    name: 'createClubFinancialAccount',
  })
  async createClubFinancialAccount(
    @CurrentClub() club: Club,
    @Args('input') input: CreateClubFinancialAccountInput,
  ): Promise<ClubFinancialAccountGraph> {
    const r = await this.financialAccounts.create(club.id, {
      kind: input.kind,
      label: input.label,
      accountingAccountId: input.accountingAccountId,
      iban: input.iban ?? null,
      bic: input.bic ?? null,
      stripeAccountId: input.stripeAccountId ?? null,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? 0,
      notes: input.notes ?? null,
    });
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      accountingAccountId: r.accountingAccountId,
      accountingAccountCode: r.accountingAccount.code,
      accountingAccountLabel: r.accountingAccount.label,
      iban: r.iban,
      bic: r.bic,
      stripeAccountId: r.stripeAccountId,
      isDefault: r.isDefault,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      notes: r.notes,
    };
  }

  @Mutation(() => ClubFinancialAccountGraph, {
    name: 'updateClubFinancialAccount',
  })
  async updateClubFinancialAccount(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubFinancialAccountInput,
  ): Promise<ClubFinancialAccountGraph> {
    const r = await this.financialAccounts.update(club.id, input.id, {
      label: input.label,
      iban: input.iban,
      bic: input.bic,
      stripeAccountId: input.stripeAccountId,
      isDefault: input.isDefault,
      isActive: input.isActive,
      notes: input.notes,
      sortOrder: input.sortOrder,
    });
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      accountingAccountId: r.accountingAccountId,
      accountingAccountCode: r.accountingAccount.code,
      accountingAccountLabel: r.accountingAccount.label,
      iban: r.iban,
      bic: r.bic,
      stripeAccountId: r.stripeAccountId,
      isDefault: r.isDefault,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      notes: r.notes,
    };
  }

  @Mutation(() => Boolean, { name: 'archiveClubFinancialAccount' })
  async archiveClubFinancialAccount(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.financialAccounts.archive(club.id, id);
  }

  // =========================================================================
  // Routes paiement
  // =========================================================================

  @Query(() => [ClubPaymentRouteGraph], { name: 'clubPaymentRoutes' })
  async clubPaymentRoutes(
    @CurrentClub() club: Club,
  ): Promise<ClubPaymentRouteGraph[]> {
    await this.seedService.seedIfEmpty(club.id);
    const rows = await this.paymentRoutes.listAll(club.id);
    return rows.map((r) => ({
      id: r.id,
      method: r.method,
      financialAccountId: r.financialAccountId,
      financialAccountLabel: r.financialAccount.label,
      financialAccountCode: r.financialAccount.accountingAccount.code,
    }));
  }

  @Mutation(() => ClubPaymentRouteGraph, { name: 'upsertClubPaymentRoute' })
  async upsertClubPaymentRoute(
    @CurrentClub() club: Club,
    @Args('input') input: UpsertClubPaymentRouteInput,
  ): Promise<ClubPaymentRouteGraph> {
    const r = await this.paymentRoutes.upsert(
      club.id,
      input.method,
      input.financialAccountId,
    );
    return {
      id: r.id,
      method: r.method,
      financialAccountId: r.financialAccountId,
      financialAccountLabel: r.financialAccount.label,
      financialAccountCode: r.financialAccount.accountingAccount.code,
    };
  }

  @Mutation(() => Boolean, { name: 'deleteClubPaymentRoute' })
  async deleteClubPaymentRoute(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.paymentRoutes.delete(club.id, id);
  }

  // =========================================================================
  // Consolidation opt-in
  // =========================================================================

  @Query(() => ConsolidationPreviewGraph, {
    name: 'accountingEntryConsolidationPreview',
  })
  async accountingEntryConsolidationPreview(
    @CurrentClub() club: Club,
    @Args('entryId', { type: () => ID }) entryId: string,
  ): Promise<ConsolidationPreviewGraph> {
    const r = await this.consolidation.preview(club.id, entryId);
    return {
      eligible: r.eligible,
      reason: r.reason,
      groups: r.groups.map((g) => ({
        accountCode: g.accountCode,
        accountLabel: g.accountLabel,
        lineCount: g.lineCount,
        totalCents: g.totalCents,
      })),
    };
  }

  @Mutation(() => Boolean, { name: 'consolidateAccountingEntry' })
  async consolidateAccountingEntry(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('entryId', { type: () => ID }) entryId: string,
  ): Promise<boolean> {
    await this.consolidation.consolidate(club.id, user.userId, entryId);
    return true;
  }

  @Mutation(() => Boolean, { name: 'unconsolidateAccountingEntry' })
  async unconsolidateAccountingEntry(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('entryId', { type: () => ID }) entryId: string,
  ): Promise<boolean> {
    await this.consolidation.unconsolidate(club.id, user.userId, entryId);
    return true;
  }

  /**
   * Change le compte financier (banque/caisse/transit) de contrepartie
   * d'une écriture en cours de revue. Met à jour l'entry ET la ligne
   * contrepartie. Refusé si l'entry est déjà comptabilisée (POSTED/LOCKED).
   */
  @Mutation(() => Boolean, { name: 'updateAccountingEntryFinancialAccount' })
  async updateAccountingEntryFinancialAccount(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('entryId', { type: () => ID }) entryId: string,
    @Args('financialAccountId', { type: () => ID })
    financialAccountId: string,
  ): Promise<boolean> {
    await this.accounting.updateEntryFinancialAccount(
      club.id,
      user.userId,
      entryId,
      financialAccountId,
    );
    return true;
  }
}
