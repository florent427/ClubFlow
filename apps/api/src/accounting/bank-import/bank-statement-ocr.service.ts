import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AccountingAuditAction,
  AiUsageFeature,
  BankStatementFormat,
  BankStatementLineIgnoreReason,
  BankStatementLineStatus,
  BankStatementStatus,
  Prisma,
} from '@prisma/client';
import { AiBudgetService } from '../../ai/ai-budget.service';
import { AiSettingsService } from '../../ai/ai-settings.service';
import { OpenrouterService } from '../../ai/openrouter.service';
import { MediaAssetsService } from '../../media/media-assets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { formatIsoDate, parseIsoDate } from '../accounting-fiscal-year.service';
import {
  PdfPageRenderer,
  errorMessage,
  pickSecondVisionModel,
  pickVisionModel,
} from '../ocr-shared';
import type { RenderedPage } from '../ocr-shared';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankStatementIntegrityService } from './bank-statement-integrity.service';
import { mergeReadings } from './merge-readings';
import type { MergedReading, StatementReading } from './merge-readings';
import {
  STATEMENT_READING_SYSTEM_PROMPT,
  buildStatementReadingPrompt,
  parseStatementReadingJson,
} from './statement-reading';
import { checkStatementIntegrity, deriveStatementStatus } from './statement-integrity';

/** Pages par appel : au-delà, les modèles tronquent les longs tableaux. */
const PAGES_PER_CALL = 3;
const MAX_PAGES = 10;

export interface ReadingSetup {
  apiKey: string;
  textModel: string;
  modelA: string;
  modelB: string;
}

export interface ModelUsage {
  model: string;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ReadOutcome {
  a: StatementReading | null;
  b: StatementReading | null;
  usage: ModelUsage[];
  /** Un message par lecture en échec. */
  errors: string[];
  /** Avertissements de lecture (lignes écartées…). */
  warnings: string[];
  pageCount: number;
}

interface ModelReading {
  reading: StatementReading;
  usage: ModelUsage;
  warnings: string[];
}

/**
 * Lecture d'un relevé PDF par deux modèles vision indépendants
 * (ADR-0014 §3), fusion des lectures, puis contrôle d'intégrité : le relevé
 * n'est exploitable que si l'arithmétique tombe juste ET qu'aucune
 * divergence de lecture n'attend un humain. Les deux lectures en échec →
 * `FAILED`, avec la relance ou le dépôt en OFX/CSV comme issue.
 */
@Injectable()
export class BankStatementOcrService {
  private readonly logger = new Logger(BankStatementOcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSettings: AiSettingsService,
    private readonly aiBudget: AiBudgetService,
    private readonly openrouter: OpenrouterService,
    private readonly media: MediaAssetsService,
    private readonly audit: AccountingAuditService,
    private readonly reconciliation: BankReconciliationService,
    private readonly renderer: PdfPageRenderer,
    private readonly integrity: BankStatementIntegrityService,
  ) {}

  /**
   * Clé IA et budget vérifiés AVANT de créer quoi que ce soit : un PDF
   * refusé proprement, les dépôts OFX et CSV intacts.
   */
  async assertCanRead(clubId: string): Promise<ReadingSetup> {
    let apiKey: string;
    try {
      apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    } catch (err) {
      throw new BadRequestException(
        `${errorMessage(err)} Sinon, dépose ce relevé en OFX ou en CSV.`,
      );
    }
    const budget = await this.aiBudget.checkBudget(clubId);
    if (!budget.allowed) {
      throw new BadRequestException(
        'Budget IA du mois atteint : dépose ce relevé en OFX ou en CSV, ou relève le budget (Paramètres → IA).',
      );
    }
    const models = await this.aiSettings.getModels(clubId);
    const modelA = pickVisionModel(models.textModel);
    return {
      apiKey,
      textModel: models.textModel,
      modelA,
      modelB: pickSecondVisionModel(modelA, models.textFallbackModel),
    };
  }

  /** Lance la lecture sans bloquer l'appelant ; toute erreur finit en `FAILED`. */
  readInBackground(clubId: string, userId: string, statementId: string): void {
    void this.runReading(clubId, userId, statementId).catch(async (err: unknown) => {
      const msg = errorMessage(err);
      this.logger.error(`[relevé PDF ${statementId}] lecture en échec : ${msg}`);
      await this.markFailed(statementId, `Lecture impossible : ${msg}`);
    });
  }

  /**
   * Lecture d'un PDF par les deux modèles, sans toucher à la base : testable
   * avec un renderer et un client OpenRouter factices.
   */
  async readBuffer(setup: ReadingSetup, buffer: Buffer): Promise<ReadOutcome> {
    const pages = await this.renderer.render(buffer, this.logger, MAX_PAGES);
    if (pages.length === 0) throw new Error('PDF sans page lisible.');
    const chunks: RenderedPage[][] = [];
    for (let i = 0; i < pages.length; i += PAGES_PER_CALL) {
      chunks.push(pages.slice(i, i + PAGES_PER_CALL));
    }
    const [ra, rb] = await Promise.allSettled([
      this.readWithModel(setup.apiKey, setup.modelA, chunks, pages.length),
      this.readWithModel(setup.apiKey, setup.modelB, chunks, pages.length),
    ]);
    const out: ReadOutcome = {
      a: null,
      b: null,
      usage: [],
      errors: [],
      warnings: [],
      pageCount: pages.length,
    };
    const take = (label: 'A' | 'B', r: PromiseSettledResult<ModelReading>, model: string) => {
      if (r.status === 'fulfilled') {
        out[label === 'A' ? 'a' : 'b'] = r.value.reading;
        out.usage.push(r.value.usage);
        out.warnings.push(...r.value.warnings.map((w) => `Lecture ${label} : ${w}`));
      } else {
        const msg = `Lecture ${label} (${model}) : ${errorMessage(r.reason)}`;
        out.errors.push(msg);
        this.logger.warn(`[relevé PDF] ${msg}`);
      }
    };
    take('A', ra, setup.modelA);
    take('B', rb, setup.modelB);
    return out;
  }

  private async readWithModel(
    apiKey: string,
    model: string,
    chunks: RenderedPage[][],
    pageCount: number,
  ): Promise<ModelReading> {
    const usage: ModelUsage = { model, costCents: 0, inputTokens: 0, outputTokens: 0 };
    const warnings: string[] = [];
    const reading: StatementReading = {
      iban: null,
      periodStart: null,
      periodEnd: null,
      openingBalanceCents: null,
      closingBalanceCents: null,
      lines: [],
    };
    let running: number | null = null;
    for (const chunk of chunks) {
      const prompt = buildStatementReadingPrompt({
        pageNumbers: chunk.map((p) => p.page),
        pageCount,
        nativeText: chunk.map((p) => p.text).filter(Boolean).join('\n\n--- PAGE ---\n\n'),
        previousRunningBalanceCents: running,
      });
      const content: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [{ type: 'text', text: prompt }];
      for (const p of chunk) {
        for (const url of p.dataUrls) content.push({ type: 'image_url', image_url: { url } });
      }
      const result = await this.openrouter.chatCompletion({
        apiKey,
        model,
        responseFormat: 'json_object',
        messages: [
          { role: 'system', content: STATEMENT_READING_SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        temperature: 0,
        maxTokens: 8000,
      });
      usage.costCents += result.costCents ?? 0;
      usage.inputTokens += result.inputTokens;
      usage.outputTokens += result.outputTokens;
      const parsed = parseStatementReadingJson(result.content);
      if (!parsed.reading) {
        throw new Error(parsed.warnings.join(' ') || 'réponse illisible');
      }
      warnings.push(...parsed.warnings);
      const r = parsed.reading;
      if (chunk[0].page === 1) {
        reading.iban = r.iban;
        reading.periodStart = r.periodStart;
        reading.openingBalanceCents = r.openingBalanceCents;
        running = r.openingBalanceCents;
      }
      reading.lines.push(...r.lines);
      if (r.periodEnd) reading.periodEnd = r.periodEnd;
      if (r.closingBalanceCents !== null) reading.closingBalanceCents = r.closingBalanceCents;
      const lastWithBalance = [...r.lines].reverse().find((l) => l.balanceAfterCents !== null);
      if (lastWithBalance) running = lastWithBalance.balanceAfterCents;
      else if (running !== null) running += r.lines.reduce((s, l) => s + l.amountCents, 0);
    }
    if (reading.lines.length === 0) throw new Error('aucune opération lue');
    return { reading, usage, warnings };
  }

  /**
   * La lecture complète d'un relevé `PARSING` : lectures, fusion, contrôle,
   * persistance, rapprochement. Appelée par `readInBackground` ; publique
   * pour être testée avec des doubles.
   */
  async runReading(clubId: string, userId: string, statementId: string): Promise<void> {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, clubId },
      select: {
        id: true,
        status: true,
        format: true,
        mediaAssetId: true,
        financialAccountId: true,
        financialAccount: { select: { openingBalanceCents: true } },
        club: { select: { accountingStartsOn: true } },
      },
    });
    if (!st) return;
    if (st.format !== BankStatementFormat.PDF || !st.mediaAssetId) {
      await this.markFailed(st.id, 'Ce relevé n’a pas de fichier PDF à lire.');
      return;
    }
    let setup: ReadingSetup;
    try {
      setup = await this.assertCanRead(clubId);
    } catch (err) {
      await this.markFailed(st.id, errorMessage(err));
      return;
    }
    const buffer = await this.loadAssetBuffer(clubId, st.mediaAssetId);
    const outcome = await this.readBuffer(setup, buffer);

    // Coût journalisé même si la lecture est inexploitable : il est payé.
    let totalCost = 0;
    let totalIn = 0;
    let totalOut = 0;
    for (const u of outcome.usage) {
      totalCost += u.costCents;
      totalIn += u.inputTokens;
      totalOut += u.outputTokens;
      await this.aiSettings.logUsage({
        clubId,
        userId,
        feature: AiUsageFeature.BANK_STATEMENT_OCR,
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        imagesGenerated: 0,
        costCents: u.costCents,
      });
    }
    if (outcome.usage.length > 0) {
      await this.aiBudget.incrementUsage(
        clubId,
        AiUsageFeature.BANK_STATEMENT_OCR,
        totalCost,
        totalIn,
        totalOut,
      );
    }

    if (!outcome.a && !outcome.b) {
      await this.markFailed(
        st.id,
        `Lecture impossible par les deux modèles. ${outcome.errors.join(' | ')} Relance la lecture ou dépose le relevé en OFX/CSV.`,
        { aiCostCents: totalCost, readingModelA: setup.modelA, readingModelB: setup.modelB },
      );
      return;
    }

    const merged = mergeReadings(outcome.a, outcome.b);
    const messages = [...outcome.errors, ...merged.warnings, ...outcome.warnings];
    if (merged.lines.length === 0) {
      await this.markFailed(
        st.id,
        `Aucune opération lue. ${messages.join(' | ')}`,
        { aiCostCents: totalCost, readingModelA: setup.modelA, readingModelB: setup.modelB },
      );
      return;
    }

    const dates = merged.lines.map((l) => l.bookedOn).sort();
    const periodStart = parseIsoDate(merged.periodStart ?? dates[0]);
    const periodEnd = parseIsoDate(merged.periodEnd ?? dates[dates.length - 1]);
    if (periodEnd.getTime() < periodStart.getTime()) {
      messages.push('Période lue incohérente : bornes recalculées sur les opérations.');
    }
    const start = periodEnd.getTime() < periodStart.getTime() ? parseIsoDate(dates[0]) : periodStart;
    const end =
      periodEnd.getTime() < periodStart.getTime() ? parseIsoDate(dates[dates.length - 1]) : periodEnd;

    const overlap = await this.prisma.bankStatement.findFirst({
      where: {
        clubId,
        financialAccountId: st.financialAccountId,
        id: { not: st.id },
        status: { notIn: [BankStatementStatus.FAILED, BankStatementStatus.PARSING] },
        periodStart: { lte: end },
        periodEnd: { gte: start },
      },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlap) {
      await this.markFailed(
        st.id,
        `Ce relevé (${formatIsoDate(start)} → ${formatIsoDate(end)}) chevauche celui du ${formatIsoDate(overlap.periodStart)} au ${formatIsoDate(overlap.periodEnd)} : supprime-le.`,
        { aiCostCents: totalCost, readingModelA: setup.modelA, readingModelB: setup.modelB },
      );
      return;
    }
    const previous = await this.integrity.previousStatement(
      clubId,
      st.financialAccountId,
      start,
      st.id,
    );
    const previousClosing = previous
      ? previous.closingBalanceCents
      : (st.financialAccount.openingBalanceCents ?? null);

    const balancesRead =
      merged.openingBalanceCents !== null && merged.closingBalanceCents !== null;
    if (!balancesRead) {
      messages.push(
        'Soldes de début ou de fin non lus : renseigne-les (« Corriger les soldes ») pour lancer le contrôle.',
      );
    }
    const opening = merged.openingBalanceCents ?? 0;
    const closing = merged.closingBalanceCents ?? 0;
    const integrity = checkStatementIntegrity({
      openingBalanceCents: opening,
      closingBalanceCents: closing,
      lineAmounts: merged.lines.map((l) => l.amountCents),
      previousClosingCents: previousClosing,
    });
    const effective = balancesRead ? integrity : { ...integrity, ok: false };
    const takeover = st.club.accountingStartsOn;
    const lineStatuses = merged.lines.map((l) =>
      takeover && parseIsoDate(l.bookedOn).getTime() < takeover.getTime()
        ? BankStatementLineStatus.IGNORED
        : BankStatementLineStatus.UNMATCHED,
    );
    const status = deriveStatementStatus(effective, lineStatuses, {
      unresolvedDivergences: merged.divergenceCount,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.bankStatementLine.deleteMany({ where: { statementId: st.id } });
      await tx.bankStatementLine.createMany({
        data: merged.lines.map((l, i) => ({
          clubId,
          statementId: st.id,
          financialAccountId: st.financialAccountId,
          lineIndex: i,
          bookedOn: parseIsoDate(l.bookedOn),
          valueOn: l.valueOn ? parseIsoDate(l.valueOn) : null,
          label: l.label.slice(0, 500),
          rawLabel: l.label.slice(0, 2000),
          amountCents: l.amountCents,
          balanceAfterCents: l.balanceAfterCents,
          status: lineStatuses[i],
          ignoreReason:
            lineStatuses[i] === BankStatementLineStatus.IGNORED
              ? BankStatementLineIgnoreReason.BEFORE_TAKEOVER
              : null,
          readingAgreement: l.readingAgreement,
          divergenceJson: l.divergence
            ? (JSON.parse(JSON.stringify(l.divergence)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        })),
      });
      await tx.bankStatement.update({
        where: { id: st.id },
        data: {
          status,
          periodStart: start,
          periodEnd: end,
          openingBalanceCents: opening,
          closingBalanceCents: closing,
          lineCount: merged.lines.length,
          integrityDeltaCents: balancesRead ? integrity.deltaCents : null,
          chainOk: balancesRead ? integrity.chainOk : null,
          chainExpectedCents: integrity.chainExpectedCents,
          previousStatementId: previous?.id ?? null,
          readingAJson: outcome.a
            ? (JSON.parse(JSON.stringify(outcome.a)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
          readingBJson: outcome.b
            ? (JSON.parse(JSON.stringify(outcome.b)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
          readingModelA: setup.modelA,
          readingModelB: setup.modelB,
          aiCostCents: totalCost,
          error: messages.length > 0 ? messages.join('\n') : null,
        },
      });
    });

    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.STATEMENT_IMPORT,
      metadata: {
        statementId: st.id,
        format: 'PDF',
        phase: 'READ',
        modelA: setup.modelA,
        modelB: setup.modelB,
        singleReading: merged.singleReading,
        lineCount: merged.lines.length,
        divergences: merged.divergenceCount,
        deltaCents: balancesRead ? integrity.deltaCents : null,
        chainOk: balancesRead ? integrity.chainOk : null,
        costCents: totalCost,
        pageCount: outcome.pageCount,
        status,
      },
    });
    this.logger.log(
      `[relevé PDF ${st.id}] ${merged.lines.length} lignes, ${merged.divergenceCount} divergence(s), delta ${balancesRead ? integrity.deltaCents : 'n/a'}, statut ${status}, coût ${totalCost} c`,
    );
    // Un relevé plus récent déjà déposé se chaîne désormais sur celui-ci.
    await this.integrity.rechainFollowing(clubId, st.financialAccountId, end, st.id);
    if (status === BankStatementStatus.READY) {
      await this.reconciliation.autoMatch(clubId, st.id);
    }
  }

  private async markFailed(
    statementId: string,
    message: string,
    extra: Partial<{ aiCostCents: number; readingModelA: string; readingModelB: string }> = {},
  ): Promise<void> {
    try {
      await this.prisma.bankStatement.update({
        where: { id: statementId },
        data: { status: BankStatementStatus.FAILED, error: message.slice(0, 4000), ...extra },
      });
    } catch (err) {
      // Relevé supprimé pendant la lecture : rien à marquer.
      this.logger.warn(`[relevé PDF ${statementId}] échec non enregistré : ${errorMessage(err)}`);
    }
  }

  /**
   * Le fichier archivé est privé : `streamFor` répond « introuvable » à qui
   * ne présente pas le club propriétaire (volontaire, pas de fuite par
   * énumération). Ici on lit pour le compte du club lui-même.
   */
  private async loadAssetBuffer(clubId: string, assetId: string): Promise<Buffer> {
    const { stream } = await this.media.streamFor(assetId, { clubId });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }
}

export type { MergedReading };
