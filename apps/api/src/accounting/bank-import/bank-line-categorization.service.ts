import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  AiUsageFeature,
  BankStatementLineStatus,
  BankStatementStatus,
  CategorizationDirection,
  CategorizationRuleSource,
  Prisma,
} from '@prisma/client';
import { AiBudgetService } from '../../ai/ai-budget.service';
import { AiSettingsService } from '../../ai/ai-settings.service';
import { OpenrouterService } from '../../ai/openrouter.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingAllocationService } from '../accounting-allocation.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { AccountingService } from '../accounting.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { applyRules, learnedPatternFor, normalizeStatementLabel } from './categorization-rules';
import type { CategorizationRule } from './categorization-rules';
import {
  CATEGORIZATION_SYSTEM_PROMPT,
  buildCategorizationPrompt,
  parseCategorizationJson,
} from './line-categorization-prompt';
import type { ConversationTurn, ParsedCategorization } from './line-categorization-prompt';

/** Deux avis concordants suffisent à partir de ce seuil. */
export const CLEAR_WITH_TWO_OPINIONS_PCT = 80;
/** Un seul avis disponible : on exige davantage, faute de recoupement. */
export const CLEAR_WITH_ONE_OPINION_PCT = 90;
/** Au-delà, on arrête de demander : la saisie manuelle est plus rapide. */
export const MAX_AI_ATTEMPTS = 3;
const FEW_SHOT_EXAMPLES = 8;

export interface LineProposal {
  accountCode: string;
  accountLabel: string;
  projectId: string | null;
  projectTitle: string | null;
  label: string;
  confidencePct: number;
  source: 'RULE' | 'AI';
  ruleId: string | null;
  reasoning: string | null;
  /** Modèles consultés, pour que le trésorier sache d'où vient l'avis. */
  models: string[];
  /** Règle appliquée, ou deux modèles d'accord : validable en lot. */
  clear: boolean;
}

export interface CategorizationOutcome {
  status: 'PROPOSED' | 'QUESTION' | 'EXHAUSTED' | 'SKIPPED';
  proposal: LineProposal | null;
  question: string | null;
}

type LineRow = Prisma.BankStatementLineGetPayload<{
  include: {
    statement: {
      select: {
        id: true;
        status: true;
        financialAccountId: true;
        financialAccount: {
          select: { label: true; accountingAccount: { select: { code: true } } };
        };
      };
    };
  };
}>;

const lineInclude = {
  statement: {
    select: {
      id: true,
      status: true,
      financialAccountId: true,
      financialAccount: {
        select: { label: true, accountingAccount: { select: { code: true } } },
      },
    },
  },
} satisfies Prisma.BankStatementLineInclude;

/**
 * Catégorisation des lignes de relevé sans écriture (ADR-0014 §5).
 *
 * Trois étages, du moins cher au plus cher : une règle du club décide seule ;
 * sinon deux modèles donnent chacun un avis et ne valent que s'ils
 * concordent ; sinon l'IA pose UNE question au trésorier. Toute proposition
 * devient une écriture `NEEDS_REVIEW` — elle apparaît donc dans la file de
 * revue habituelle, il n'y a qu'une seule boîte de réception. Rien ne passe
 * en comptabilité sans un clic humain, et ce clic apprend une règle.
 */
@Injectable()
export class BankLineCategorizationService {
  private readonly logger = new Logger(BankLineCategorizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSettings: AiSettingsService,
    private readonly aiBudget: AiBudgetService,
    private readonly openrouter: OpenrouterService,
    private readonly audit: AccountingAuditService,
    private readonly allocation: AccountingAllocationService,
    private readonly accounting: AccountingService,
    private readonly reconciliation: BankReconciliationService,
  ) {}

  // ── Règles du club ────────────────────────────────────────────────────

  async listRules(clubId: string) {
    return this.prisma.accountingCategorizationRule.findMany({
      where: { clubId },
      orderBy: [{ isActive: 'desc' }, { hitCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async upsertRule(
    clubId: string,
    userId: string,
    input: {
      id?: string | null;
      pattern: string;
      matchKind: CategorizationRule['matchKind'];
      direction: CategorizationDirection;
      accountCode: string;
      projectId?: string | null;
      label?: string | null;
      isActive?: boolean | null;
    },
  ) {
    const pattern = input.pattern.trim();
    if (pattern.length < 2) {
      throw new BadRequestException('Motif trop court : au moins deux caractères.');
    }
    if (input.matchKind === 'REGEX') {
      try {
        new RegExp(pattern);
      } catch (err) {
        throw new BadRequestException(
          `Expression régulière invalide : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    await this.assertAccountExists(clubId, input.accountCode);
    const data = {
      pattern,
      matchKind: input.matchKind,
      direction: input.direction,
      accountCode: input.accountCode,
      projectId: input.projectId ?? null,
      label: input.label?.trim() || null,
      isActive: input.isActive ?? true,
    };
    if (input.id) {
      const existing = await this.prisma.accountingCategorizationRule.findFirst({
        where: { id: input.id, clubId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Règle introuvable');
      return this.prisma.accountingCategorizationRule.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.accountingCategorizationRule.upsert({
      where: { clubId_pattern_direction: { clubId, pattern, direction: data.direction } },
      create: {
        ...data,
        clubId,
        source: CategorizationRuleSource.MANUAL,
        createdByUserId: userId,
      },
      update: data,
    });
  }

  async deleteRule(clubId: string, ruleId: string): Promise<boolean> {
    const rule = await this.prisma.accountingCategorizationRule.findFirst({
      where: { id: ruleId, clubId },
      select: { id: true },
    });
    if (!rule) return false;
    await this.prisma.accountingCategorizationRule.delete({ where: { id: rule.id } });
    return true;
  }

  // ── Catégorisation ────────────────────────────────────────────────────

  /**
   * Catégorise une ligne. `silent` (traitement de fond) renvoie `SKIPPED`
   * là où un appel explicite lève : le trésorier qui clique doit savoir
   * pourquoi rien ne se passe.
   */
  async categorizeLine(
    clubId: string,
    userId: string,
    lineId: string,
    opts: { silent?: boolean } = {},
  ): Promise<CategorizationOutcome> {
    const line = await this.loadLine(clubId, lineId);
    const skip = (reason: string): CategorizationOutcome => {
      if (!opts.silent) throw new BadRequestException(reason);
      return { status: 'SKIPPED', proposal: null, question: null };
    };
    if (line.status !== BankStatementLineStatus.UNMATCHED) {
      return skip('Seule une ligne à traiter peut être catégorisée.');
    }
    if (
      line.statement.status === BankStatementStatus.NEEDS_CHECK ||
      line.statement.status === BankStatementStatus.FAILED ||
      line.statement.status === BankStatementStatus.PARSING
    ) {
      return skip('Le relevé doit passer le contrôle d’intégrité avant toute catégorisation.');
    }
    if (line.proposedEntryId) {
      return skip('Cette ligne a déjà une proposition : valide-la ou rejette-la.');
    }

    const ruleOutcome = await this.tryRules(clubId, userId, line);
    if (ruleOutcome) return ruleOutcome;

    if (line.aiExhausted) {
      if (opts.silent) {
        // Le traitement de fond ne revient jamais sur une ligne abandonnée :
        // ce serait payer deux fois la même impasse.
        return { status: 'SKIPPED', proposal: null, question: null };
      }
      // Un clic humain rouvre le dossier : le compteur d'essais repart, la
      // conversation déjà eue est conservée.
      await this.prisma.bankStatementLine.update({
        where: { id: line.id },
        data: { aiExhausted: false, aiAttempts: 0 },
      });
      line.aiExhausted = false;
      line.aiAttempts = 0;
    }
    return this.runAi(clubId, userId, line, opts);
  }

  /** Répond à la question posée sur une ligne, puis relance la réflexion. */
  async answerQuestion(
    clubId: string,
    userId: string,
    lineId: string,
    answer: string,
  ): Promise<CategorizationOutcome> {
    const line = await this.loadLine(clubId, lineId);
    const text = answer.trim();
    if (!text) throw new BadRequestException('Réponse vide.');
    if (!line.aiQuestion) {
      throw new BadRequestException('Aucune question en attente sur cette ligne.');
    }
    const conversation = this.conversationOf(line);
    conversation.push({ role: 'USER', text: text.slice(0, 500) });
    await this.prisma.bankStatementLine.update({
      where: { id: line.id },
      data: {
        aiQuestion: null,
        aiConversationJson: conversation as unknown as Prisma.InputJsonValue,
      },
    });
    const refreshed = await this.loadLine(clubId, lineId);
    return this.runAi(clubId, userId, refreshed, {});
  }

  /**
   * Catégorise en tâche de fond les lignes encore à traiter d'un relevé,
   * une par une pour ne pas rafaler l'API, en s'arrêtant dès que le budget
   * IA est épuisé.
   */
  categorizeStatementInBackground(clubId: string, userId: string, statementId: string): void {
    void this.categorizeStatement(clubId, userId, statementId).catch((err: unknown) => {
      this.logger.warn(
        `[catégorisation ${statementId}] arrêtée : ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async categorizeStatement(clubId: string, userId: string, statementId: string): Promise<void> {
    const lines = await this.prisma.bankStatementLine.findMany({
      where: {
        clubId,
        statementId,
        status: BankStatementLineStatus.UNMATCHED,
        proposedEntryId: null,
        aiExhausted: false,
        aiQuestion: null,
      },
      orderBy: { lineIndex: 'asc' },
      select: { id: true },
    });
    if (lines.length === 0) return;
    this.logger.log(`[catégorisation ${statementId}] ${lines.length} ligne(s) à examiner`);
    let failures = 0;
    for (const l of lines) {
      const budget = await this.aiBudget.checkBudget(clubId);
      if (!budget.allowed) {
        this.logger.warn(`[catégorisation ${statementId}] budget IA atteint, arrêt`);
        return;
      }
      try {
        await this.categorizeLine(clubId, userId, l.id, { silent: true });
        failures = 0;
      } catch (err) {
        failures++;
        this.logger.warn(
          `[catégorisation ligne ${l.id}] ${err instanceof Error ? err.message : String(err)}`,
        );
        // Trois échecs d'affilée : c'est la configuration ou le fournisseur,
        // pas la ligne. Inutile de brûler le reste du relevé.
        if (failures >= 3) return;
      }
    }
  }

  // ── Validation, rejet, apprentissage ──────────────────────────────────

  /**
   * Valide la proposition : l'écriture passe en POSTED, ce qui rapproche la
   * ligne (`onEntryPosted`), et la décision devient une règle.
   */
  async accept(
    clubId: string,
    userId: string,
    lineId: string,
    overrides: { accountCode?: string | null; projectId?: string | null; label?: string | null } = {},
  ): Promise<void> {
    const line = await this.loadLine(clubId, lineId);
    if (!line.proposedEntryId) {
      throw new BadRequestException('Aucune proposition à valider sur cette ligne.');
    }
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: line.proposedEntryId, clubId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!entry) throw new NotFoundException('Écriture proposée introuvable');
    if (entry.status !== AccountingEntryStatus.NEEDS_REVIEW) {
      throw new BadRequestException('Cette proposition a déjà été traitée.');
    }
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    const mainLine = entry.lines.find((l) => l.accountCode !== cashCode) ?? entry.lines[0];
    let accountCode = mainLine.accountCode;
    if (overrides.accountCode && overrides.accountCode !== accountCode) {
      const account = await this.assertAccountExists(clubId, overrides.accountCode);
      accountCode = account.code;
      await this.prisma.accountingEntryLine.update({
        where: { id: mainLine.id },
        data: { accountCode: account.code, accountLabel: account.label },
      });
    }
    const label = overrides.label?.trim();
    if (label) {
      await this.prisma.accountingEntry.update({
        where: { id: entry.id },
        data: { label: label.slice(0, 200) },
      });
    }
    let projectId = overrides.projectId !== undefined ? overrides.projectId : undefined;
    if (projectId !== undefined) {
      await this.prisma.accountingAllocation.updateMany({
        where: { lineId: mainLine.id },
        data: { projectId },
      });
      await this.prisma.accountingEntry.update({
        where: { id: entry.id },
        data: { projectId },
      });
    } else {
      projectId = entry.projectId;
    }

    const touched: { statementId: string | null } = { statementId: null };
    await this.prisma.$transaction(async (tx) => {
      await tx.accountingEntryLine.updateMany({
        where: { entryId: entry.id, validatedAt: null },
        data: { validatedAt: new Date(), validatedByUserId: userId },
      });
      // Un seul chemin vers POSTED : c'est lui qui rapproche la ligne.
      touched.statementId = await this.accounting.markPosted(
        tx,
        clubId,
        entry.id,
        userId,
        'BANK_LINE_PROPOSAL',
      );
    });
    if (touched.statementId) {
      await this.reconciliation.refreshStatementStatus(clubId, touched.statementId);
    }

    await this.learnFrom(clubId, userId, line, accountCode, projectId ?? null);
    await this.audit.log({
      clubId,
      userId,
      entryId: entry.id,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'BANK_LINE_PROPOSAL_ACCEPTED',
        bankStatementLineId: line.id,
        accountCode,
        overridden: {
          account: !!overrides.accountCode && overrides.accountCode !== mainLine.accountCode,
          label: !!label,
          project: overrides.projectId !== undefined,
        },
      },
    });
  }

  /**
   * Valide en lot. Une ligne dont la proposition n'est pas claire est
   * écartée ici, côté serveur : le bouton « tout valider » ne doit jamais
   * pouvoir poster une proposition douteuse, même si le client le demande.
   */
  async bulkAccept(
    clubId: string,
    userId: string,
    lineIds: string[],
  ): Promise<{ accepted: number; skipped: number }> {
    let accepted = 0;
    let skipped = 0;
    for (const lineId of lineIds) {
      const line = await this.prisma.bankStatementLine.findFirst({
        where: { id: lineId, clubId },
        select: { id: true, status: true, proposedEntryId: true, aiProposalJson: true },
      });
      const proposal = this.proposalOf(line?.aiProposalJson ?? null);
      if (
        !line ||
        line.status !== BankStatementLineStatus.UNMATCHED ||
        !line.proposedEntryId ||
        !proposal?.clear
      ) {
        skipped++;
        continue;
      }
      try {
        await this.accept(clubId, userId, line.id);
        accepted++;
      } catch (err) {
        skipped++;
        this.logger.warn(
          `[validation en lot] ligne ${line.id} écartée : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { accepted, skipped };
  }

  /** Rejette la proposition : l'écriture disparaît, la ligne revient à traiter. */
  async reject(clubId: string, userId: string, lineId: string): Promise<void> {
    const line = await this.loadLine(clubId, lineId);
    if (!line.proposedEntryId) {
      throw new BadRequestException('Aucune proposition à rejeter sur cette ligne.');
    }
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: line.proposedEntryId, clubId, status: AccountingEntryStatus.NEEDS_REVIEW },
      select: { id: true, label: true },
    });
    if (!entry) {
      throw new BadRequestException('Cette proposition a déjà été traitée.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          proposedEntryId: null,
          aiProposalJson: Prisma.DbNull,
          aiQuestion: null,
          ruleId: null,
          // Rejetée : on ne repropose pas la même chose au prochain passage.
          aiExhausted: true,
        },
      });
      await tx.accountingEntry.delete({ where: { id: entry.id } });
    });
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'BANK_LINE_PROPOSAL_REJECTED',
        bankStatementLineId: line.id,
        deletedEntryLabel: entry.label,
      },
    });
  }

  // ── Interne ───────────────────────────────────────────────────────────

  private async loadLine(clubId: string, lineId: string): Promise<LineRow> {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, clubId },
      include: lineInclude,
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    return line;
  }

  private conversationOf(line: { aiConversationJson: Prisma.JsonValue | null }): ConversationTurn[] {
    const raw = line.aiConversationJson;
    if (!Array.isArray(raw)) return [];
    const turns: ConversationTurn[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const t = item as Record<string, unknown>;
      const text = typeof t.text === 'string' ? t.text : '';
      if (!text) continue;
      turns.push({ role: t.role === 'USER' ? 'USER' : 'ASSISTANT', text });
    }
    return turns;
  }

  proposalOf(raw: Prisma.JsonValue | null): LineProposal | null {
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

  private async assertAccountExists(clubId: string, code: string) {
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code } },
      select: { code: true, label: true, kind: true, isActive: true },
    });
    if (!account || !account.isActive) {
      throw new BadRequestException(`Compte ${code} inconnu au plan comptable du club.`);
    }
    return account;
  }

  private async tryRules(
    clubId: string,
    userId: string,
    line: LineRow,
  ): Promise<CategorizationOutcome | null> {
    const rows = await this.prisma.accountingCategorizationRule.findMany({
      where: { clubId, isActive: true },
    });
    const rules: CategorizationRule[] = rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      matchKind: r.matchKind,
      direction: r.direction,
      accountCode: r.accountCode,
      projectId: r.projectId,
      label: r.label,
      isActive: r.isActive,
    }));
    const match = applyRules(rules, line.label, line.amountCents);
    if (!match) return null;
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: match.rule.accountCode } },
      select: { code: true, label: true, isActive: true },
    });
    if (!account || !account.isActive) {
      // La règle vise un compte supprimé ou désactivé : on la laisse de côté
      // et on repasse par l'IA plutôt que de proposer un compte mort.
      this.logger.warn(
        `[règle ${match.rule.id}] compte ${match.rule.accountCode} inconnu ou inactif, règle ignorée`,
      );
      return null;
    }
    const project = match.rule.projectId
      ? await this.prisma.clubProject.findFirst({
          where: { id: match.rule.projectId, clubId },
          select: { id: true, title: true },
        })
      : null;
    const proposal: LineProposal = {
      accountCode: account.code,
      accountLabel: account.label,
      projectId: project?.id ?? null,
      projectTitle: project?.title ?? null,
      label: match.rule.label?.trim() || this.defaultLabel(line.label),
      confidencePct: 100,
      source: 'RULE',
      ruleId: match.rule.id,
      reasoning: `Règle « ${match.rule.pattern} » du club.`,
      models: [],
      clear: true,
    };
    await this.materialize(clubId, userId, line, proposal);
    return { status: 'PROPOSED', proposal, question: null };
  }

  private async runAi(
    clubId: string,
    userId: string,
    line: LineRow,
    opts: { silent?: boolean },
  ): Promise<CategorizationOutcome> {
    const budget = await this.aiBudget.checkBudget(clubId);
    if (!budget.allowed) {
      if (opts.silent) return { status: 'SKIPPED', proposal: null, question: null };
      throw new BadRequestException(
        'Budget IA du mois atteint : catégorise cette ligne à la main, ou relève le budget (Paramètres → IA).',
      );
    }
    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const models = await this.aiSettings.getModels(clubId);
    const modelList = [models.textModel];
    if (models.textFallbackModel && models.textFallbackModel !== models.textModel) {
      modelList.push(models.textFallbackModel);
    }

    const isCredit = line.amountCents >= 0;
    const [accountRows, projects, ruleRows, examples] = await Promise.all([
      this.prisma.accountingAccount.findMany({
        where: { clubId, isActive: true },
        orderBy: { code: 'asc' },
        select: { code: true, label: true, kind: true },
      }),
      this.prisma.clubProject.findMany({
        where: { clubId, status: { in: ['PLANNED', 'ACTIVE'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, title: true },
      }),
      this.prisma.accountingCategorizationRule.findMany({
        where: { clubId, isActive: true },
        orderBy: { hitCount: 'desc' },
        take: 30,
        select: { pattern: true, direction: true, accountCode: true },
      }),
      this.recentDecisions(clubId, line),
    ]);
    // Le sens du mouvement ferme la moitié du plan comptable : un
    // encaissement ne va pas sur un compte de charges.
    const accounts = accountRows.filter((a) =>
      isCredit ? a.kind !== 'EXPENSE' : a.kind !== 'INCOME',
    );
    const knownCodes = new Set(accounts.map((a) => a.code));
    const knownProjects = new Set(projects.map((p) => p.id));
    const conversation = this.conversationOf(line);
    const prompt = buildCategorizationPrompt({
      label: line.label,
      amountCents: line.amountCents,
      bookedOn: line.bookedOn.toISOString().slice(0, 10),
      financialAccountLabel: line.statement.financialAccount.label,
      accounts,
      projects,
      rules: ruleRows,
      examples,
      conversation,
    });

    const settled = await Promise.allSettled(
      modelList.map((model) =>
        this.openrouter
          .chatCompletion({
            apiKey,
            model,
            temperature: 0.1,
            maxTokens: 700,
            messages: [
              { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
              { role: 'user', content: prompt },
            ],
          })
          .then((r) => ({ model, r })),
      ),
    );
    const answers: Array<{ model: string; parsed: ParsedCategorization }> = [];
    let costCents = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    for (const s of settled) {
      if (s.status !== 'fulfilled') {
        this.logger.warn(
          `[catégorisation] modèle en échec : ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`,
        );
        continue;
      }
      const { model, r } = s.value;
      costCents += r.costCents ?? 0;
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      await this.aiSettings.logUsage({
        clubId,
        userId,
        feature: AiUsageFeature.BANK_LINE_CATEGORIZATION,
        model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        imagesGenerated: 0,
        costCents: r.costCents ?? 0,
      });
      const parsed = parseCategorizationJson(r.content, knownCodes, knownProjects);
      if (parsed) answers.push({ model, parsed });
    }
    if (costCents > 0 || inputTokens > 0) {
      await this.aiBudget.incrementUsage(
        clubId,
        AiUsageFeature.BANK_LINE_CATEGORIZATION,
        costCents,
        inputTokens,
        outputTokens,
      );
    }

    const attempts = line.aiAttempts + 1;
    const withAccount = answers.filter((a) => a.parsed.accountCode !== null);
    const best = [...withAccount].sort(
      (a, b) => b.parsed.confidencePct - a.parsed.confidencePct,
    )[0];
    const clear = this.isClear(withAccount.map((a) => a.parsed));
    const lastAttempt = attempts >= MAX_AI_ATTEMPTS;

    if (best && (clear || lastAttempt)) {
      const proposal = await this.proposalFromAnswer(
        clubId,
        line,
        best.parsed,
        answers.map((a) => a.model),
        clear,
      );
      await this.materialize(clubId, userId, line, proposal, {
        attempts,
        exhausted: !clear,
      });
      return { status: clear ? 'PROPOSED' : 'EXHAUSTED', proposal, question: null };
    }

    const question = this.questionFrom(withAccount, line.label);
    const conversationWithQuestion = [...conversation, { role: 'ASSISTANT' as const, text: question }];
    await this.prisma.bankStatementLine.update({
      where: { id: line.id },
      data: {
        aiQuestion: lastAttempt ? null : question,
        aiAttempts: attempts,
        aiExhausted: lastAttempt,
        aiConversationJson: (lastAttempt
          ? conversation
          : conversationWithQuestion) as unknown as Prisma.InputJsonValue,
      },
    });
    return lastAttempt
      ? { status: 'EXHAUSTED', proposal: null, question: null }
      : { status: 'QUESTION', proposal: null, question };
  }

  /**
   * Deux avis qui désignent le même compte suffisent à 80 ; un seul avis,
   * faute de recoupement, demande 90.
   */
  private isClear(parsed: ParsedCategorization[]): boolean {
    if (parsed.length === 0) return false;
    if (parsed.length === 1) return parsed[0].confidencePct >= CLEAR_WITH_ONE_OPINION_PCT;
    const codes = new Set(parsed.map((p) => p.accountCode));
    if (codes.size > 1) return false;
    return Math.min(...parsed.map((p) => p.confidencePct)) >= CLEAR_WITH_TWO_OPINIONS_PCT;
  }

  private questionFrom(
    answers: Array<{ parsed: ParsedCategorization }>,
    label: string,
  ): string {
    const sorted = [...answers].sort((a, b) => b.parsed.confidencePct - a.parsed.confidencePct);
    const asked = sorted.find((a) => a.parsed.question)?.parsed.question;
    if (asked) return asked.slice(0, 200);
    const codes = [...new Set(sorted.map((a) => a.parsed.accountCode))].filter(Boolean);
    if (codes.length > 1) {
      return `« ${label} » : je propose ${codes.join(' ou ')}. Lequel est le bon, et à quoi correspond cette opération ?`;
    }
    return `À quoi correspond « ${label} » ? Précise la nature de la dépense ou de la recette.`;
  }

  private async proposalFromAnswer(
    clubId: string,
    line: LineRow,
    parsed: ParsedCategorization,
    models: string[],
    clear: boolean,
  ): Promise<LineProposal> {
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: parsed.accountCode as string } },
      select: { code: true, label: true },
    });
    const project = parsed.projectId
      ? await this.prisma.clubProject.findFirst({
          where: { id: parsed.projectId, clubId },
          select: { id: true, title: true },
        })
      : null;
    return {
      accountCode: account?.code ?? (parsed.accountCode as string),
      accountLabel: account?.label ?? '',
      projectId: project?.id ?? null,
      projectTitle: project?.title ?? null,
      label: parsed.label?.slice(0, 200) || this.defaultLabel(line.label),
      confidencePct: parsed.confidencePct,
      source: 'AI',
      ruleId: null,
      reasoning: parsed.reasoning,
      models,
      clear,
    };
  }

  /** Décisions passées sur des libellés qui partagent un jeton avec celui-ci. */
  private async recentDecisions(clubId: string, line: LineRow) {
    const tokens = new Set(
      normalizeStatementLabel(line.label)
        .split(' ')
        .filter((t) => t.length >= 4),
    );
    if (tokens.size === 0) return [];
    const rows = await this.prisma.bankStatementLine.findMany({
      where: {
        clubId,
        id: { not: line.id },
        status: BankStatementLineStatus.MATCHED,
        proposedEntryId: { not: null },
      },
      orderBy: { resolvedAt: 'desc' },
      take: 60,
      select: { label: true, proposedEntryId: true },
    });
    const similar = rows.filter((r) =>
      normalizeStatementLabel(r.label)
        .split(' ')
        .some((t) => tokens.has(t)),
    );
    const picked = similar.slice(0, FEW_SHOT_EXAMPLES);
    if (picked.length === 0) return [];
    const entries = await this.prisma.accountingEntry.findMany({
      where: { id: { in: picked.map((p) => p.proposedEntryId as string) } },
      select: {
        id: true,
        financialAccountId: true,
        lines: { select: { accountCode: true, accountLabel: true } },
      },
    });
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    const byId = new Map(entries.map((e) => [e.id, e]));
    return picked
      .map((p) => {
        const entry = byId.get(p.proposedEntryId as string);
        const main = entry?.lines.find((l) => l.accountCode !== cashCode);
        return main
          ? { label: p.label, accountCode: main.accountCode, accountLabel: main.accountLabel }
          : null;
      })
      .filter((e): e is { label: string; accountCode: string; accountLabel: string } => e !== null);
  }

  private defaultLabel(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  /**
   * Crée l'écriture `NEEDS_REVIEW` qui porte la proposition : deux lignes,
   * la contrepartie de trésorerie (déjà validée, elle n'est pas en question)
   * et le compte proposé, qui garde la trace de l'avis IA. Elle rejoint la
   * file de revue habituelle.
   */
  private async materialize(
    clubId: string,
    userId: string,
    line: LineRow,
    proposal: LineProposal,
    state: { attempts?: number; exhausted?: boolean } = {},
  ): Promise<void> {
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    const cash = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: cashCode } },
      select: { code: true, label: true },
    });
    if (!cash) {
      throw new BadRequestException(
        `Compte de trésorerie ${cashCode} absent du plan comptable : impossible de proposer une écriture.`,
      );
    }
    const amount = Math.abs(line.amountCents);
    const isCredit = line.amountCents >= 0;
    // Un mouvement entre deux comptes du club n'est ni une recette ni une
    // dépense : c'est un virement interne.
    const kind = proposal.accountCode.startsWith('5')
      ? AccountingEntryKind.TRANSFER
      : isCredit
        ? AccountingEntryKind.INCOME
        : AccountingEntryKind.EXPENSE;
    const cashSide = isCredit ? AccountingLineSide.DEBIT : AccountingLineSide.CREDIT;
    const mainSide = isCredit ? AccountingLineSide.CREDIT : AccountingLineSide.DEBIT;

    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind,
          status: AccountingEntryStatus.NEEDS_REVIEW,
          source: AccountingEntrySource.BANK_IMPORT,
          label: proposal.label,
          amountCents: amount,
          occurredAt: line.bookedOn,
          createdByUserId: userId,
          financialAccountId: line.statement.financialAccountId,
          projectId: proposal.projectId,
        },
      });
      const mainLine = await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: proposal.accountCode,
          accountLabel: proposal.accountLabel,
          side: mainSide,
          debitCents: mainSide === AccountingLineSide.DEBIT ? amount : 0,
          creditCents: mainSide === AccountingLineSide.CREDIT ? amount : 0,
          sortOrder: 0,
          iaSuggestedAccountCode: proposal.accountCode,
          iaReasoning: proposal.reasoning,
          iaConfidencePct: proposal.confidencePct,
        },
      });
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: cash.code,
          accountLabel: cash.label,
          side: cashSide,
          debitCents: cashSide === AccountingLineSide.DEBIT ? amount : 0,
          creditCents: cashSide === AccountingLineSide.CREDIT ? amount : 0,
          sortOrder: 1,
          // La contrepartie bancaire n'est pas en question : c'est le relevé
          // qui la donne. Seul le compte proposé attend un humain.
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
      });
      await this.allocation.persistAllocationsForLine(tx, mainLine.id, clubId, [
        {
          amountCents: amount,
          projectId: proposal.projectId,
          cohortCode: null,
          disciplineCode: null,
          freeformTags: [],
        },
      ]);
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          proposedEntryId: entry.id,
          aiProposalJson: JSON.parse(JSON.stringify(proposal)) as Prisma.InputJsonValue,
          ruleId: proposal.ruleId,
          aiQuestion: null,
          ...(state.attempts !== undefined ? { aiAttempts: state.attempts } : {}),
          ...(state.exhausted !== undefined ? { aiExhausted: state.exhausted } : {}),
        },
      });
    });
    this.logger.log(
      `[ligne ${line.id}] proposition ${proposal.accountCode} (${proposal.source}, ${proposal.confidencePct} %, ${proposal.clear ? 'sûre' : 'à revoir'})`,
    );
  }

  /**
   * La validation enseigne : la règle qui a servi gagne un point, une
   * décision prise sans règle en crée une. C'est ce qui fait qu'un club
   * paie l'IA une fois par fournisseur, pas une fois par mois.
   */
  private async learnFrom(
    clubId: string,
    userId: string,
    line: LineRow,
    accountCode: string,
    projectId: string | null,
  ): Promise<void> {
    if (line.ruleId) {
      const rule = await this.prisma.accountingCategorizationRule.findFirst({
        where: { id: line.ruleId, clubId },
        select: { id: true, accountCode: true },
      });
      if (rule && rule.accountCode === accountCode) {
        await this.prisma.accountingCategorizationRule.update({
          where: { id: rule.id },
          data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
        });
        return;
      }
      // Le trésorier a corrigé le compte : la règle ne dit plus le vrai,
      // on la laisse et on en apprend une nouvelle ci-dessous.
    }
    const pattern = learnedPatternFor(line.label);
    if (!pattern) return;
    const direction = line.amountCents >= 0 ? CategorizationDirection.CREDIT : CategorizationDirection.DEBIT;
    await this.prisma.accountingCategorizationRule.upsert({
      where: { clubId_pattern_direction: { clubId, pattern, direction } },
      create: {
        clubId,
        pattern,
        matchKind: 'CONTAINS',
        direction,
        accountCode,
        projectId,
        source: CategorizationRuleSource.LEARNED,
        hitCount: 1,
        lastHitAt: new Date(),
        createdByUserId: userId,
      },
      update: {
        accountCode,
        projectId,
        isActive: true,
        hitCount: { increment: 1 },
        lastHitAt: new Date(),
      },
    });
  }
}
