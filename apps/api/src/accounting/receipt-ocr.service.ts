import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  AiUsageFeature,
} from '@prisma/client';
import * as crypto from 'crypto';
import { AiBudgetService } from '../ai/ai-budget.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { OpenrouterService } from '../ai/openrouter.service';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { MediaAssetsService } from '../media/media-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingMappingService } from './accounting-mapping.service';

// ─────────────────────────────────────────────────────────────────────────
//  Types — pipeline en 3 appels IA
// ─────────────────────────────────────────────────────────────────────────

/** Appel 1 — OCR brut sur la photo (extraction littérale, sans contexte). */
interface OcrRawExtraction {
  vendor: string | null;
  invoiceNumber: string | null;
  totalTtcCents: number | null;
  /** Stocké pour info — l'asso ne sépare pas la TVA. */
  vatCents: number | null;
  date: string | null;
  items: Array<{
    description: string;
    totalCents: number | null;
    suggestedAccountCode: string | null;
  }>;
  pcgAccountCode: string | null;
  confidencePerField: Record<string, number>;
}

/**
 * Appel 2 — Expertise comptable (vision + contexte club). Le modèle voit
 * la photo ET reçoit le plan comptable réel + les projets actifs. Il
 * propose directement une ventilation finale.
 */
interface AccountingExpertise {
  vendor: string | null;
  invoiceNumber: string | null;
  totalTtcCents: number | null;
  date: string | null;
  globalReasoning: string;
  globalConfidencePct: number;
  lines: Array<{
    accountCode: string;
    amountCents: number;
    label: string;
    reasoning: string;
    confidencePct: number;
    projectId: string | null;
  }>;
}

/**
 * Appel 3 — Comparateur. Reçoit les 2 résultats précédents et produit la
 * décision finale. Indique les points d'accord/désaccord pour ajuster la
 * confiance globale (si OCR et Expertise convergent → confiance haute).
 */
export interface CategorizedDecision {
  vendor: string | null;
  invoiceNumber: string | null;
  totalTtcCents: number;
  date: string | null;
  globalReasoning: string;
  globalConfidencePct: number;
  /** Concordance entre OCR brut et Expertise sur chaque dimension clé. */
  agreement: {
    vendor: boolean;
    total: boolean;
    date: boolean;
    lines: boolean;
  };
  lines: Array<{
    accountCode: string;
    amountCents: number;
    label: string;
    reasoning: string;
    confidencePct: number;
    projectId: string | null;
    /** Items OCR d'origine fusionnés sur cette ligne (pour audit). */
    sourceLabels: string[];
  }>;
}

/**
 * Modèles connus pour supporter l'analyse d'images sur OpenRouter (au
 * moment du dernier audit). Si le `textModel` configuré côté club n'est
 * PAS dans cette liste, on bascule sur `DEFAULT_VISION_MODEL` pour les 2
 * appels vision (OCR brut + Expertise). Le 3e appel (Comparateur, texte
 * seul) garde le `textModel` choisi.
 *
 * Sans ce switch, OpenRouter renvoie un 404 :
 *   "no endpoints found that match your filter"
 * → c'est exactement le crash remonté par l'utilisateur lorsqu'un club
 * a configuré un modèle texte-seul (ex. `meta-llama/llama-3.3-70b`).
 */
const VISION_CAPABLE_MODELS = new Set<string>([
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-sonnet',
  'anthropic/claude-3-haiku',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash-001',
  'google/gemini-1.5-pro',
  'google/gemini-1.5-flash',
  'mistralai/pixtral-large-2411',
  'mistralai/pixtral-12b',
  'meta-llama/llama-3.2-90b-vision-instruct',
  'meta-llama/llama-3.2-11b-vision-instruct',
]);

const DEFAULT_VISION_MODEL = 'anthropic/claude-sonnet-4-5';

function pickVisionModel(textModel: string): string {
  return VISION_CAPABLE_MODELS.has(textModel) ? textModel : DEFAULT_VISION_MODEL;
}

// ─────────────────────────────────────────────────────────────────────────
//  Service
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pipeline OCR / extraction IA pour les reçus et factures, en 3 étapes :
 *
 *   1. **OCR brut** (vision) — lit littéralement la facture. Vendor,
 *      n° facture, items, totaux, date.
 *   2. **Expertise comptable** (vision + contexte club, en PARALLÈLE de #1)
 *      — voit la photo ET reçoit le plan comptable + projets actifs du
 *      club. Propose une ventilation finale (1 ou N lignes par compte).
 *   3. **Comparateur** (texte seul, après #1+#2) — confronte les 2
 *      résultats et produit la décision finale, avec un score d'accord
 *      qui boost la confiance quand les 2 IA convergent.
 *
 * Spécificités association :
 * - **Pas de TVA** : on stocke `vatCents` pour info, jamais de ligne TVA
 *   séparée. Montant débit = TTC plein.
 * - **Label auto** : `"{n°facture} — {vendor}"` (ou fallback).
 * - **Séparation auto** : si la décision finale propose ≥ 2 comptes, N
 *   lignes débit groupées par compte. Sinon 1 ligne unique sans détail.
 *
 * Robustesse :
 * - Si appel #1 échoue mais #2 OK → on prend #2 directement.
 * - Si #1+#2 OK mais #3 échoue → on prend #2 (plus structurée que #1).
 * - Si tous échouent → entry stub vide pour saisie 100 % manuelle.
 */
@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSettings: AiSettingsService,
    private readonly aiBudget: AiBudgetService,
    private readonly openrouter: OpenrouterService,
    private readonly mapping: AccountingMappingService,
    private readonly audit: AccountingAuditService,
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  private async isAccountingEnabled(clubId: string): Promise<boolean> {
    const row = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.ACCOUNTING },
      },
    });
    return row?.enabled === true;
  }

  /**
   * Charge le contexte du club nécessaire à l'expertise + comparateur.
   * 1 seule requête concurrente, mise en cache implicitement par appel.
   */
  private async loadClubContext(clubId: string): Promise<{
    accounts: Array<{ code: string; label: string; kind: string }>;
    projects: Array<{ id: string; title: string }>;
  }> {
    const [accounts, projects] = await Promise.all([
      this.prisma.accountingAccount.findMany({
        where: { clubId, isActive: true },
        select: { code: true, label: true, kind: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.clubProject.findMany({
        where: { clubId, status: 'ACTIVE' },
        select: { id: true, title: true },
        orderBy: { title: 'asc' },
        take: 20,
      }),
    ]);
    return { accounts, projects };
  }

  /**
   * Lance le pipeline complet. Retourne l'id de l'AccountingExtraction
   * créée + de l'AccountingEntry NEEDS_REVIEW associée.
   */
  async extractFromMediaAsset(
    clubId: string,
    mediaAssetId: string,
    userId: string,
  ): Promise<{
    extractionId: string;
    entryId: string | null;
    duplicateOfEntryId: string | null;
    budgetBlocked: boolean;
  }> {
    if (!(await this.isAccountingEnabled(clubId))) {
      throw new BadRequestException(
        'Module comptabilité désactivé pour ce club.',
      );
    }

    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaAssetId, clubId },
    });
    if (!asset) {
      throw new BadRequestException('Document introuvable.');
    }

    // 1. Lecture du buffer via le storage adapter (compatible disque
    //    local OU S3/R2). On garde le buffer en mémoire pour l'utiliser
    //    à la fois pour le hash de dédup et pour l'envoi vision IA.
    let assetBuffer: Buffer;
    try {
      assetBuffer = await this.loadAssetBuffer(mediaAssetId);
    } catch (err) {
      this.logger.error(
        `[OCR ${mediaAssetId}] Impossible de lire le fichier : ${this.errorMsg(err)}`,
      );
      throw new BadRequestException(
        'Impossible de récupérer le fichier source du document.',
      );
    }

    // 2. Hash du fichier pour déduplication
    let sha256 = asset.sha256;
    if (!sha256) {
      sha256 = crypto.createHash('sha256').update(assetBuffer).digest('hex');
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { sha256 },
      });
    }

    // 2. Dédup par hash
    if (sha256) {
      const dupAsset = await this.prisma.mediaAsset.findFirst({
        where: { clubId, sha256, id: { not: asset.id } },
      });
      if (dupAsset) {
        const dupDoc = await this.prisma.accountingDocument.findFirst({
          where: { clubId, mediaAssetId: dupAsset.id },
          select: { entryId: true },
        });
        if (dupDoc) {
          return {
            extractionId: '',
            entryId: null,
            duplicateOfEntryId: dupDoc.entryId,
            budgetBlocked: false,
          };
        }
      }
    }

    // 3. Check budget IA (1 fois pour les 3 appels)
    const budget = await this.aiBudget.checkBudget(clubId);
    if (!budget.allowed) {
      this.logger.warn(
        `Club ${clubId} a dépassé son budget IA mensuel, OCR fallback manuel.`,
      );
      const entry = await this.createStubEntry(clubId, userId, mediaAssetId, null, null);
      return {
        extractionId: '',
        entryId: entry.id,
        duplicateOfEntryId: null,
        budgetBlocked: true,
      };
    }

    // 4. Setup commun
    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const models = await this.aiSettings.getModels(clubId);
    if (!apiKey || !models.textModel) {
      throw new BadRequestException(
        'Configuration IA du club incomplète (clé OpenRouter / modèle texte manquant).',
      );
    }

    const dataUrl = this.bufferToDataUrl(assetBuffer, asset.mimeType);
    const ctx = await this.loadClubContext(clubId);

    // Si le textModel n'est pas vision-capable, on bascule sur un modèle
    // vision pour les 2 appels image (sinon OpenRouter renvoie 404
    // "no endpoints found"). Le comparateur garde le textModel original.
    const visionModel = pickVisionModel(models.textModel);
    if (visionModel !== models.textModel) {
      this.logger.log(
        `[OCR ${mediaAssetId}] textModel ${models.textModel} sans vision → fallback ${visionModel}`,
      );
    }

    // 5. Appels 1 + 2 EN PARALLÈLE — extraction OCR brute & expertise
    let totalCostCents = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastErrorMsg: string | null = null;

    const [ocrRes, expRes] = await Promise.allSettled([
      this.runOcrRaw(apiKey, visionModel, dataUrl),
      this.runExpertise(apiKey, visionModel, dataUrl, ctx),
    ]);

    let ocrRaw: OcrRawExtraction | null = null;
    let expertise: AccountingExpertise | null = null;

    if (ocrRes.status === 'fulfilled') {
      ocrRaw = ocrRes.value.parsed;
      totalCostCents += ocrRes.value.usage.costCents;
      totalInputTokens += ocrRes.value.usage.inputTokens;
      totalOutputTokens += ocrRes.value.usage.outputTokens;
    } else {
      lastErrorMsg = `OCR raw failed: ${this.errorMsg(ocrRes.reason)}`;
      this.logger.warn(`[OCR ${mediaAssetId}] ${lastErrorMsg}`);
    }

    if (expRes.status === 'fulfilled') {
      expertise = expRes.value.parsed;
      totalCostCents += expRes.value.usage.costCents;
      totalInputTokens += expRes.value.usage.inputTokens;
      totalOutputTokens += expRes.value.usage.outputTokens;
    } else {
      const m = `Expertise failed: ${this.errorMsg(expRes.reason)}`;
      lastErrorMsg = lastErrorMsg ? `${lastErrorMsg} | ${m}` : m;
      this.logger.warn(`[OCR ${mediaAssetId}] ${m}`);
    }

    // 6. Appel 3 — comparateur (uniquement si on a au moins 2 sources)
    let decision: CategorizedDecision | null = null;
    if (ocrRaw && expertise) {
      try {
        const cmpRes = await this.runComparator(
          apiKey,
          models.textModel,
          ocrRaw,
          expertise,
          ctx,
        );
        decision = cmpRes.parsed;
        totalCostCents += cmpRes.usage.costCents;
        totalInputTokens += cmpRes.usage.inputTokens;
        totalOutputTokens += cmpRes.usage.outputTokens;
      } catch (err) {
        const m = `Comparator failed: ${this.errorMsg(err)}`;
        lastErrorMsg = lastErrorMsg ? `${lastErrorMsg} | ${m}` : m;
        this.logger.warn(`[OCR ${mediaAssetId}] ${m}`);
      }
    }

    // Fallbacks : si pas de décision comparateur, on synthétise depuis ce qu'on a.
    if (!decision) {
      if (expertise) {
        decision = this.expertiseToDecision(expertise, ocrRaw);
      } else if (ocrRaw) {
        decision = this.ocrToDecision(ocrRaw, ctx);
      }
    }

    // 7. Log usage IA cumulé
    await this.aiSettings.logUsage({
      clubId,
      userId,
      feature: AiUsageFeature.RECEIPT_OCR,
      model: models.textModel,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      imagesGenerated: 0,
      costCents: totalCostCents,
    });
    await this.aiBudget.incrementUsage(
      clubId,
      AiUsageFeature.RECEIPT_OCR,
      totalCostCents,
      totalInputTokens,
      totalOutputTokens,
    );

    // 8. Persiste AccountingExtraction (OCR brut + décision finale)
    const extraction = await this.prisma.accountingExtraction.create({
      data: {
        clubId,
        mediaAssetId,
        rawJson: (ocrRaw
          ? JSON.parse(JSON.stringify(ocrRaw))
          : { error: lastErrorMsg ?? 'no-result' }) as object,
        confidencePerField: (ocrRaw?.confidencePerField ?? {}) as object,
        extractedTotalCents:
          decision?.totalTtcCents ?? ocrRaw?.totalTtcCents ?? null,
        extractedVatCents: ocrRaw?.vatCents ?? null,
        extractedDate:
          decision?.date && !Number.isNaN(new Date(decision.date).getTime())
            ? new Date(decision.date)
            : ocrRaw?.date && !Number.isNaN(new Date(ocrRaw.date).getTime())
              ? new Date(ocrRaw.date)
              : null,
        extractedVendor: decision?.vendor ?? ocrRaw?.vendor ?? null,
        extractedInvoiceNumber:
          decision?.invoiceNumber ?? ocrRaw?.invoiceNumber ?? null,
        extractedAccountCode:
          ocrRaw?.pcgAccountCode ??
          decision?.lines[0]?.accountCode ??
          null,
        ...(decision
          ? {
              categorizationJson: JSON.parse(
                JSON.stringify(decision),
              ) as object,
            }
          : {}),
        model: models.textModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costCents: totalCostCents,
        pageCount: 1,
        error: lastErrorMsg,
      },
    });

    // 9. Crée l'AccountingEntry NEEDS_REVIEW
    const entry = await this.createStubEntry(
      clubId,
      userId,
      mediaAssetId,
      extraction,
      decision,
    );

    await this.audit.log({
      clubId,
      userId,
      entryId: entry.id,
      action: 'CREATE',
      metadata: {
        source: 'OCR_AI',
        extractionId: extraction.id,
        model: models.textModel,
        costCents: totalCostCents,
        pipeline: {
          ocrRawOk: !!ocrRaw,
          expertiseOk: !!expertise,
          comparatorOk: !!decision && !!ocrRaw && !!expertise,
          globalConfidence: decision?.globalConfidencePct ?? null,
        },
      },
    });

    return {
      extractionId: extraction.id,
      entryId: entry.id,
      duplicateOfEntryId: null,
      budgetBlocked: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Appels IA
  // ─────────────────────────────────────────────────────────────────────

  /** Appel 1 — extraction OCR brute. */
  private async runOcrRaw(
    apiKey: string,
    model: string,
    dataUrl: string,
  ): Promise<{
    parsed: OcrRawExtraction | null;
    usage: { costCents: number; inputTokens: number; outputTokens: number };
  }> {
    const result = await this.openrouter.chatCompletion({
      apiKey,
      model,
      responseFormat: 'json_object',
      messages: [
        {
          role: 'system',
          content:
            'Tu es un OCR comptable spécialisé. Tu réponds UNIQUEMENT en JSON strict, sans markdown.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: this.buildOcrPrompt() },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      maxTokens: 2500,
    });
    const parsed = this.parseOcrJson(result.content);
    return {
      parsed,
      usage: {
        costCents: result.costCents ?? 0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  /** Appel 2 — expertise comptable (vision + contexte club). */
  private async runExpertise(
    apiKey: string,
    model: string,
    dataUrl: string,
    ctx: { accounts: Array<{ code: string; label: string }>; projects: Array<{ id: string; title: string }> },
  ): Promise<{
    parsed: AccountingExpertise | null;
    usage: { costCents: number; inputTokens: number; outputTokens: number };
  }> {
    const result = await this.openrouter.chatCompletion({
      apiKey,
      model,
      responseFormat: 'json_object',
      messages: [
        {
          role: 'system',
          content:
            "Tu es un expert-comptable senior pour associations sportives françaises. Tu analyses les factures et proposes une ventilation comptable précise. Tu réponds UNIQUEMENT en JSON strict, sans markdown.",
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: this.buildExpertisePrompt(ctx) },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      maxTokens: 2500,
    });
    const parsed = this.parseExpertiseJson(result.content);
    return {
      parsed,
      usage: {
        costCents: result.costCents ?? 0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  /** Appel 3 — comparateur. Synthétise la décision finale (texte seul). */
  private async runComparator(
    apiKey: string,
    model: string,
    ocrRaw: OcrRawExtraction,
    expertise: AccountingExpertise,
    ctx: { accounts: Array<{ code: string; label: string }>; projects: Array<{ id: string; title: string }> },
  ): Promise<{
    parsed: CategorizedDecision | null;
    usage: { costCents: number; inputTokens: number; outputTokens: number };
  }> {
    const result = await this.openrouter.chatCompletion({
      apiKey,
      model,
      responseFormat: 'json_object',
      messages: [
        {
          role: 'system',
          content:
            "Tu es un auditeur comptable. Tu reçois 2 analyses indépendantes d'une même facture (un OCR brut + une expertise) et tu produis la décision finale. Tu réponds UNIQUEMENT en JSON strict.",
        },
        {
          role: 'user',
          content: this.buildComparatorPrompt(ocrRaw, expertise, ctx),
        },
      ],
      temperature: 0.1,
      maxTokens: 2500,
    });
    const parsed = this.parseDecisionJson(result.content);
    return {
      parsed,
      usage: {
        costCents: result.costCents ?? 0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Prompts
  // ─────────────────────────────────────────────────────────────────────

  private buildOcrPrompt(): string {
    return `Extrais les informations littérales de cette facture/reçu. Pas d'interprétation comptable, juste lecture.

Réponds en JSON strict :
{
  "vendor": "nom commerçant ou null",
  "invoiceNumber": "n° facture / ticket / reçu ou null",
  "totalTtcCents": "total TTC en centimes (entier) ou null",
  "vatCents": "TVA en centimes si visible ou null",
  "date": "date émission YYYY-MM-DD ou null",
  "items": [
    {
      "description": "libellé article",
      "totalCents": "montant TTC ligne en centimes",
      "suggestedAccountCode": "code PCG 6 chiffres si évident, sinon null"
    }
  ],
  "pcgAccountCode": "compte PCG global proposé ou null",
  "confidencePerField": {
    "vendor": "0-1",
    "invoiceNumber": "0-1",
    "totalTtcCents": "0-1",
    "date": "0-1"
  }
}

Règles : montants en centimes (×100). Pas de récup TVA (asso). items[]=[] si pas de détail.`;
  }

  private buildExpertisePrompt(ctx: {
    accounts: Array<{ code: string; label: string }>;
    projects: Array<{ id: string; title: string }>;
  }): string {
    const accountsTxt =
      ctx.accounts.length > 0
        ? ctx.accounts.map((a) => `  - ${a.code} : ${a.label}`).join('\n')
        : '  (plan comptable vide — utilise codes PCG associatif standard)';
    const projectsTxt =
      ctx.projects.length > 0
        ? ctx.projects
            .slice(0, 15)
            .map((p) => `  - ${p.id} : ${p.title}`)
            .join('\n')
        : '  (aucun projet actif)';

    return `Analyse cette facture en tant qu'expert-comptable d'une association sportive (régime non-assujetti TVA).

Plan comptable RÉEL du club (utiliser UNIQUEMENT ces codes) :
${accountsTxt}

Projets actifs (associer une ligne à un projet si pertinent) :
${projectsTxt}

Produis une ventilation comptable directe en JSON strict :
{
  "vendor": "nom",
  "invoiceNumber": "n° ou null",
  "totalTtcCents": int,
  "date": "YYYY-MM-DD",
  "globalReasoning": "1 phrase synthèse",
  "globalConfidencePct": int 0-100,
  "lines": [
    {
      "accountCode": "code PCG (issu strictement du plan ci-dessus)",
      "amountCents": int,
      "label": "libellé court de la ligne",
      "reasoning": "1 phrase justifiant le compte choisi",
      "confidencePct": int 0-100,
      "projectId": "uuid projet OU null"
    }
  ]
}

Règles :
- Montants en centimes TTC (pas de séparation TVA).
- Si tous les articles vont sur le MÊME compte → 1 seule ligne agrégée.
- Si comptes différents → 1 ligne par compte (montants regroupés).
- Somme des lines[].amountCents == totalTtcCents (tolérer ±2 centimes).
- accountCode obligatoirement issu du plan comptable du club.
- projectId optionnel — null si aucune correspondance évidente.
- confidencePct = ta confiance dans le compte choisi (pas la lecture).`;
  }

  private buildComparatorPrompt(
    ocrRaw: OcrRawExtraction,
    expertise: AccountingExpertise,
    ctx: {
      accounts: Array<{ code: string; label: string }>;
      projects: Array<{ id: string; title: string }>;
    },
  ): string {
    const accountsTxt =
      ctx.accounts.length > 0
        ? ctx.accounts.map((a) => `  - ${a.code} : ${a.label}`).join('\n')
        : '  (plan comptable vide)';

    return `Tu es l'auditeur final. Voici 2 analyses indépendantes de la MÊME facture :

=== Source 1 : OCR brut ===
${JSON.stringify(ocrRaw, null, 2)}

=== Source 2 : Expertise comptable ===
${JSON.stringify(expertise, null, 2)}

=== Plan comptable du club ===
${accountsTxt}

Produis la DÉCISION FINALE en JSON strict :
{
  "vendor": "nom retenu (concorder les 2 sources)",
  "invoiceNumber": "n° retenu ou null",
  "totalTtcCents": int (montant retenu),
  "date": "YYYY-MM-DD ou null",
  "globalReasoning": "synthèse en 1-2 phrases — explique les choix et mentionne les divergences éventuelles",
  "globalConfidencePct": int 0-100 (HAUT si les 2 sources convergent, BAS si désaccord majeur),
  "agreement": {
    "vendor": bool,
    "total": bool,
    "date": bool,
    "lines": bool (true si découpage des lignes cohérent)
  },
  "lines": [
    {
      "accountCode": "code du plan comptable",
      "amountCents": int,
      "label": "libellé court",
      "reasoning": "1 phrase",
      "confidencePct": int 0-100,
      "projectId": "uuid ou null",
      "sourceLabels": ["items OCR d'origine sur cette ligne"]
    }
  ]
}

Règles :
- Privilégie la cohérence : si l'OCR voit 12.50€ et l'expertise 12.49€ → tu retiens la valeur la plus "ronde" et baisses légèrement la confiance.
- Si désaccord MAJEUR sur un compte : choisis l'expertise (mieux contextualisée) MAIS ramène confidencePct à ≤ 60.
- Somme(lines[].amountCents) == totalTtcCents (±2 centimes).
- accountCode strictement issu du plan comptable.
- agreement.* reflète la concordance OBJECTIVE entre les 2 sources, pas ta confiance.`;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Parsers JSON robustes
  // ─────────────────────────────────────────────────────────────────────

  private cleanJson(s: string): string {
    return s
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
  }

  private parseOcrJson(content: string): OcrRawExtraction | null {
    try {
      const parsed = JSON.parse(this.cleanJson(content)) as Record<string, unknown>;
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const items = rawItems
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          description:
            typeof x.description === 'string' && x.description.length > 0
              ? x.description
              : 'Article',
          totalCents:
            typeof x.totalCents === 'number' && Number.isFinite(x.totalCents)
              ? Math.round(x.totalCents)
              : null,
          suggestedAccountCode:
            typeof x.suggestedAccountCode === 'string' &&
            x.suggestedAccountCode.length >= 4
              ? x.suggestedAccountCode
              : null,
        }));
      return {
        vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
        invoiceNumber:
          typeof parsed.invoiceNumber === 'string' ? parsed.invoiceNumber : null,
        totalTtcCents:
          typeof parsed.totalTtcCents === 'number'
            ? Math.round(parsed.totalTtcCents)
            : null,
        vatCents:
          typeof parsed.vatCents === 'number' ? Math.round(parsed.vatCents) : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        items,
        pcgAccountCode:
          typeof parsed.pcgAccountCode === 'string' ? parsed.pcgAccountCode : null,
        confidencePerField:
          typeof parsed.confidencePerField === 'object' &&
          parsed.confidencePerField !== null
            ? (parsed.confidencePerField as Record<string, number>)
            : {},
      };
    } catch (err) {
      this.logger.warn(`[OCR raw] parse fail: ${this.errorMsg(err)}`);
      return null;
    }
  }

  private parseExpertiseJson(content: string): AccountingExpertise | null {
    try {
      const parsed = JSON.parse(this.cleanJson(content)) as Record<string, unknown>;
      const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
      const lines = rawLines
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          accountCode:
            typeof x.accountCode === 'string' && x.accountCode.length >= 4
              ? x.accountCode
              : '',
          amountCents:
            typeof x.amountCents === 'number' && Number.isFinite(x.amountCents)
              ? Math.round(x.amountCents)
              : 0,
          label: typeof x.label === 'string' ? x.label : '',
          reasoning: typeof x.reasoning === 'string' ? x.reasoning : '',
          confidencePct:
            typeof x.confidencePct === 'number'
              ? Math.max(0, Math.min(100, Math.round(x.confidencePct)))
              : 0,
          projectId: typeof x.projectId === 'string' ? x.projectId : null,
        }))
        .filter((l) => l.accountCode && l.amountCents > 0);
      return {
        vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
        invoiceNumber:
          typeof parsed.invoiceNumber === 'string' ? parsed.invoiceNumber : null,
        totalTtcCents:
          typeof parsed.totalTtcCents === 'number'
            ? Math.round(parsed.totalTtcCents)
            : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        globalReasoning:
          typeof parsed.globalReasoning === 'string' ? parsed.globalReasoning : '',
        globalConfidencePct:
          typeof parsed.globalConfidencePct === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.globalConfidencePct)))
            : 0,
        lines,
      };
    } catch (err) {
      this.logger.warn(`[Expertise] parse fail: ${this.errorMsg(err)}`);
      return null;
    }
  }

  private parseDecisionJson(content: string): CategorizedDecision | null {
    try {
      const parsed = JSON.parse(this.cleanJson(content)) as Record<string, unknown>;
      const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
      const lines = rawLines
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          accountCode:
            typeof x.accountCode === 'string' && x.accountCode.length >= 4
              ? x.accountCode
              : '',
          amountCents:
            typeof x.amountCents === 'number' && Number.isFinite(x.amountCents)
              ? Math.round(x.amountCents)
              : 0,
          label: typeof x.label === 'string' ? x.label : '',
          reasoning: typeof x.reasoning === 'string' ? x.reasoning : '',
          confidencePct:
            typeof x.confidencePct === 'number'
              ? Math.max(0, Math.min(100, Math.round(x.confidencePct)))
              : 0,
          projectId: typeof x.projectId === 'string' ? x.projectId : null,
          sourceLabels: Array.isArray(x.sourceLabels)
            ? (x.sourceLabels.filter((s) => typeof s === 'string') as string[])
            : [],
        }))
        .filter((l) => l.accountCode && l.amountCents > 0);

      const agreementRaw =
        typeof parsed.agreement === 'object' && parsed.agreement !== null
          ? (parsed.agreement as Record<string, unknown>)
          : {};

      return {
        vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
        invoiceNumber:
          typeof parsed.invoiceNumber === 'string' ? parsed.invoiceNumber : null,
        totalTtcCents:
          typeof parsed.totalTtcCents === 'number'
            ? Math.round(parsed.totalTtcCents)
            : 0,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        globalReasoning:
          typeof parsed.globalReasoning === 'string' ? parsed.globalReasoning : '',
        globalConfidencePct:
          typeof parsed.globalConfidencePct === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.globalConfidencePct)))
            : 0,
        agreement: {
          vendor: agreementRaw.vendor === true,
          total: agreementRaw.total === true,
          date: agreementRaw.date === true,
          lines: agreementRaw.lines === true,
        },
        lines,
      };
    } catch (err) {
      this.logger.warn(`[Comparator] parse fail: ${this.errorMsg(err)}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Fallbacks (si le pipeline n'a pas pu compléter)
  // ─────────────────────────────────────────────────────────────────────

  /** Si le comparateur a échoué : on prend l'expertise telle quelle. */
  private expertiseToDecision(
    exp: AccountingExpertise,
    ocrRaw: OcrRawExtraction | null,
  ): CategorizedDecision {
    return {
      vendor: exp.vendor ?? ocrRaw?.vendor ?? null,
      invoiceNumber: exp.invoiceNumber ?? ocrRaw?.invoiceNumber ?? null,
      totalTtcCents: exp.totalTtcCents ?? ocrRaw?.totalTtcCents ?? 0,
      date: exp.date ?? ocrRaw?.date ?? null,
      globalReasoning: exp.globalReasoning,
      globalConfidencePct: Math.max(0, exp.globalConfidencePct - 10), // pénalité (pas de comparaison)
      agreement: { vendor: false, total: false, date: false, lines: false },
      lines: exp.lines.map((l) => ({
        accountCode: l.accountCode,
        amountCents: l.amountCents,
        label: l.label,
        reasoning: l.reasoning,
        confidencePct: l.confidencePct,
        projectId: l.projectId,
        sourceLabels: [],
      })),
    };
  }

  /** Si l'expertise a échoué : on construit une décision depuis l'OCR brut. */
  private ocrToDecision(
    raw: OcrRawExtraction,
    ctx: { accounts: Array<{ code: string }> },
  ): CategorizedDecision {
    const validCodes = new Set(ctx.accounts.map((a) => a.code));
    const totalCents = raw.totalTtcCents ?? 0;

    // Group items par compte (filtré sur plan comptable)
    const groups = new Map<string, { amountCents: number; labels: string[] }>();
    const validItems = raw.items.filter(
      (it) => it.totalCents !== null && it.totalCents > 0,
    );
    for (const it of validItems) {
      const code =
        it.suggestedAccountCode && validCodes.has(it.suggestedAccountCode)
          ? it.suggestedAccountCode
          : raw.pcgAccountCode && validCodes.has(raw.pcgAccountCode)
            ? raw.pcgAccountCode
            : null;
      if (!code) continue;
      const g = groups.get(code) ?? { amountCents: 0, labels: [] };
      g.amountCents += it.totalCents ?? 0;
      g.labels.push(it.description);
      groups.set(code, g);
    }
    if (groups.size === 0) {
      const fallback =
        raw.pcgAccountCode && validCodes.has(raw.pcgAccountCode)
          ? raw.pcgAccountCode
          : '606800';
      groups.set(fallback, { amountCents: totalCents, labels: [] });
    }
    const lines = Array.from(groups.entries()).map(([code, g]) => ({
      accountCode: code,
      amountCents: g.amountCents,
      label:
        g.labels.length > 0
          ? g.labels.slice(0, 3).join(' · ') +
            (g.labels.length > 3 ? ` (+${g.labels.length - 3})` : '')
          : 'Facture',
      reasoning: 'OCR seul (expertise indisponible)',
      confidencePct: 50,
      projectId: null,
      sourceLabels: g.labels,
    }));

    return {
      vendor: raw.vendor,
      invoiceNumber: raw.invoiceNumber,
      totalTtcCents: totalCents,
      date: raw.date,
      globalReasoning:
        'Catégorisation depuis OCR brut uniquement (expertise IA non disponible).',
      globalConfidencePct: 40,
      agreement: { vendor: false, total: false, date: false, lines: false },
      lines,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Création de l'AccountingEntry NEEDS_REVIEW
  // ─────────────────────────────────────────────────────────────────────

  private buildAutoLabel(decision: CategorizedDecision | null): string {
    if (!decision) return 'Reçu à qualifier';
    const inv = decision.invoiceNumber?.trim();
    const ven = decision.vendor?.trim();
    if (inv && ven) return `${inv} — ${ven}`;
    if (ven) return ven;
    if (inv) return `Facture ${inv}`;
    return 'Reçu à qualifier';
  }

  private async createStubEntry(
    clubId: string,
    userId: string,
    mediaAssetId: string,
    extraction: { id: string } | null,
    decision: CategorizedDecision | null,
  ) {
    const totalCents = decision?.totalTtcCents ?? 0;
    const label = this.buildAutoLabel(decision);
    const date = decision?.date ? new Date(decision.date) : new Date();

    // Si la décision n'a aucune ligne (cas budget bloqué ou tout échec),
    // on crée une ligne unique de fallback sur EXPENSE_GENERIC.
    const fallbackCode = await this.mapping.resolveAccountCode(
      clubId,
      'EXPENSE_GENERIC',
    );
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );

    const decisionLines =
      decision?.lines && decision.lines.length > 0
        ? decision.lines
        : [
            {
              accountCode: fallbackCode,
              amountCents: totalCents,
              label: 'À qualifier',
              reasoning: '',
              confidencePct: 0,
              projectId: null,
              sourceLabels: [],
            },
          ];

    // Pré-charge tous les comptes (lignes + banque)
    const codes = Array.from(
      new Set([...decisionLines.map((l) => l.accountCode), bankCode]),
    );
    const accounts = await this.prisma.accountingAccount.findMany({
      where: { clubId, code: { in: codes } },
    });
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));

    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.EXPENSE,
          status: AccountingEntryStatus.NEEDS_REVIEW,
          source: AccountingEntrySource.OCR_AI,
          label,
          amountCents: totalCents,
          occurredAt: date,
          createdByUserId: userId,
          extractionId: extraction?.id ?? null,
        },
      });

      // Lignes débit (1 par groupe de la décision)
      let sortOrder = 0;
      for (const line of decisionLines) {
        const account = accountByCode.get(line.accountCode);
        if (!account) {
          this.logger.warn(
            `[Stub ${e.id}] Compte ${line.accountCode} introuvable, ligne ignorée`,
          );
          continue;
        }
        await tx.accountingEntryLine.create({
          data: {
            entryId: e.id,
            clubId,
            accountCode: account.code,
            accountLabel: account.label,
            label: line.label || null,
            side: AccountingLineSide.DEBIT,
            debitCents: line.amountCents,
            creditCents: 0,
            sortOrder: sortOrder++,
            mergedFromArticleLabels: line.sourceLabels,
            iaSuggestedAccountCode: line.accountCode,
            iaReasoning: line.reasoning?.slice(0, 300) || null,
            iaConfidencePct: line.confidencePct,
          },
        });
      }

      // Ligne crédit banque (contrepartie totale)
      const bank = accountByCode.get(bankCode);
      if (bank) {
        await tx.accountingEntryLine.create({
          data: {
            entryId: e.id,
            clubId,
            accountCode: bank.code,
            accountLabel: bank.label,
            side: AccountingLineSide.CREDIT,
            debitCents: 0,
            creditCents: totalCents,
            sortOrder: sortOrder++,
          },
        });
      }

      // Document attaché
      await tx.accountingDocument.create({
        data: {
          clubId,
          entryId: e.id,
          mediaAssetId,
          kind: 'RECEIPT',
        },
      });
      return e;
    });

    return entry;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────

  private errorMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Lit l'intégralité du fichier d'un asset via le storage adapter
   * (compatible disque local OU S3/R2). Retourne un Buffer en RAM.
   *
   * IMPORTANT : on passe par `MediaAssetsService.streamFor()` plutôt
   * que par `fs.readFileSync(asset.storagePath)` parce que `storagePath`
   * est une CLÉ relative au storage abstrait, PAS un chemin filesystem
   * (ça plantait avec "Fichier source introuvable sur disque" sur les
   * adapters non-local ou avec un cwd inattendu).
   */
  private async loadAssetBuffer(assetId: string): Promise<Buffer> {
    const { stream } = await this.mediaAssets.streamFor(assetId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  private bufferToDataUrl(buf: Buffer, mimeType: string): string {
    return `data:${mimeType};base64,${buf.toString('base64')}`;
  }
}
