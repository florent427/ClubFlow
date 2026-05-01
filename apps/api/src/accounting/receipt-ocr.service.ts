import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  AiUsageFeature,
} from '@prisma/client';
import * as crypto from 'crypto';
import sharp from 'sharp';
// pdf-parse n'expose pas de typings TS ; on importe en require() pour
// éviter "module has no default export". Renvoie `{ numpages, text, … }`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ numpages: number; text: string }> =
  require('pdf-parse');
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

/**
 * Modes de paiement supportés (compta analytique). String libre côté DB
 * mais on contraint la sortie IA via cette liste pour la cohérence.
 */
const PAYMENT_METHODS = [
  'CASH',
  'CHECK',
  'TRANSFER',
  'CARD',
  'DIRECT_DEBIT',
  'OTHER',
] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];
const PAYMENT_METHOD_SET = new Set<string>(PAYMENT_METHODS);

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
  /** Mode de paiement détecté (CASH, CHECK, TRANSFER, CARD, DIRECT_DEBIT, OTHER, null). */
  paymentMethod: PaymentMethod | null;
  /** N° chèque, n° virement, etc. — null si pas applicable ou pas trouvé. */
  paymentReference: string | null;
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
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
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
  /**
   * Mode de paiement final retenu (compta analytique). Null si aucune
   * source ne l'a détecté — l'utilisateur devra le saisir à la main.
   */
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  /**
   * True si l'IA n'a pas pu déterminer le mode (absent du document OU
   * divergence OCR/Expertise → demande explicite de saisie manuelle).
   */
  paymentMethodNeedsManual: boolean;
  globalReasoning: string;
  globalConfidencePct: number;
  /** Concordance entre OCR brut et Expertise sur chaque dimension clé. */
  agreement: {
    vendor: boolean;
    total: boolean;
    date: boolean;
    lines: boolean;
    paymentMethod: boolean;
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
   * Wrapper legacy 1-page. Délègue à `extractFromMediaAssets([id])`.
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
    return this.extractFromMediaAssets(clubId, [mediaAssetId], userId);
  }

  /**
   * Lance le pipeline complet sur 1 OU PLUSIEURS pages (photos d'une
   * facture multi-pages, OU PDF unique). Retourne l'id de
   * l'AccountingExtraction + de l'AccountingEntry NEEDS_REVIEW associée.
   *
   * Multi-pages :
   * - N images → on envoie les N data URLs au modèle vision dans un
   *   seul `content` array. Le modèle voit la facture entière comme un
   *   document logique unique.
   * - 1 PDF (qui peut contenir N pages côté binaire) → on envoie le
   *   PDF tel quel, l'IA le décode.
   * - Mix images + PDF → on traite les 2 dans le même appel (rare,
   *   mais supporté).
   * - `pageCount` final = somme des pages effectives (N images = N
   *   pages logiques ; PDF = pages réelles via pdf-parse).
   */
  async extractFromMediaAssets(
    clubId: string,
    mediaAssetIds: string[],
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
    if (mediaAssetIds.length === 0) {
      throw new BadRequestException('Aucun document fourni.');
    }
    if (mediaAssetIds.length > 10) {
      throw new BadRequestException(
        'Maximum 10 pages par facture (limite anti-abus IA).',
      );
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: mediaAssetIds }, clubId },
    });
    if (assets.length !== mediaAssetIds.length) {
      throw new BadRequestException(
        'Au moins un document est introuvable ou n appartient pas à ce club.',
      );
    }
    // Préserve l'ordre fourni par le client (page 1, page 2…)
    const orderedAssets = mediaAssetIds.map(
      (id) => assets.find((a) => a.id === id)!,
    );

    // Le 1er asset est utilisé comme "représentant" pour les FKs
    // (AccountingExtraction.mediaAssetId est non-nullable single — on
    // prend la 1ère page). Tous les assets sont attachés à l'entry via
    // AccountingDocument (relation many).
    const primaryAsset = orderedAssets[0];

    // 1. Charge tous les buffers en parallèle
    let buffers: Buffer[];
    try {
      buffers = await Promise.all(
        orderedAssets.map((a) => this.loadAssetBuffer(a.id)),
      );
    } catch (err) {
      this.logger.error(
        `[OCR multi] Lecture buffer échec : ${this.errorMsg(err)}`,
      );
      throw new BadRequestException(
        'Impossible de récupérer le fichier source d un document.',
      );
    }

    // 2. Hashes individuels (mis à jour si manquants en DB)
    const hashes: string[] = [];
    for (let i = 0; i < orderedAssets.length; i++) {
      const a = orderedAssets[i];
      let h = a.sha256;
      if (!h) {
        h = crypto.createHash('sha256').update(buffers[i]).digest('hex');
        await this.prisma.mediaAsset.update({
          where: { id: a.id },
          data: { sha256: h },
        });
      }
      hashes.push(h);
    }
    // Hash combiné : SHA-256 du concat des hashes individuels triés
    // (l'ordre n'impacte pas la dédup — la même facture en 2 photos
    // shootées dans un sens ou l'autre = même document logique).
    const combinedHash = crypto
      .createHash('sha256')
      .update(hashes.slice().sort().join(''))
      .digest('hex');

    // 3. Dédup : on cherche une AccountingExtraction existante avec le
    //    même combinedHash (stocké dans rawJson._combinedHash). Pour
    //    l'instant on ne dédup que sur le 1er hash (compat ancien
    //    comportement single-page) ; améliorer plus tard si besoin.
    const dupAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        clubId,
        sha256: hashes[0],
        id: { notIn: mediaAssetIds },
      },
    });
    if (dupAsset && orderedAssets.length === 1) {
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

    // 4. Check budget IA
    const budget = await this.aiBudget.checkBudget(clubId);
    if (!budget.allowed) {
      this.logger.warn(
        `Club ${clubId} a dépassé son budget IA mensuel, OCR fallback manuel.`,
      );
      const entry = await this.createStubEntry(
        clubId,
        userId,
        mediaAssetIds,
        null,
        null,
      );
      return {
        extractionId: '',
        entryId: entry.id,
        duplicateOfEntryId: null,
        budgetBlocked: true,
      };
    }

    // 5. Création IMMÉDIATE d'une entry stub avec marqueur "OCR en
    //    cours". Le pipeline IA (étapes 6+) tourne en arrière-plan et
    //    met à jour l'entry quand il a fini. L'utilisateur peut quitter
    //    l'écran et continuer à scanner d'autres factures pendant ce
    //    temps — le badge "Analyse en cours" sera affiché dans la liste
    //    et disparaîtra dès que le pipeline aboutit.
    const stubEntry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.EXPENSE,
          status: AccountingEntryStatus.NEEDS_REVIEW,
          source: AccountingEntrySource.OCR_AI,
          label: 'Analyse OCR en cours…',
          amountCents: 0,
          occurredAt: new Date(),
          createdByUserId: userId,
          aiProcessingStartedAt: new Date(),
        },
      });
      // Documents attachés tout de suite — l'utilisateur voit la photo
      // dans EntryDetail même pendant l'analyse IA.
      for (const id of mediaAssetIds) {
        await tx.accountingDocument.create({
          data: { clubId, entryId: e.id, mediaAssetId: id, kind: 'RECEIPT' },
        });
      }
      return e;
    });

    // 6. Lance le pipeline IA en BACKGROUND (Promise détaché). Le
    //    handler HTTP retourne immédiatement avec l'entryId. Erreur
    //    éventuelle = log + audit ; l'entry reste avec son label
    //    "Analyse en cours" jusqu'à intervention humaine (et le client
    //    affiche un timeout après quelques minutes).
    void this.runOcrPipelineInBackground({
      clubId,
      userId,
      stubEntryId: stubEntry.id,
      mediaAssetIds,
      orderedAssets,
      buffers,
      hashes,
      combinedHash,
      primaryAssetId: primaryAsset.id,
    }).catch((err) => {
      this.logger.error(
        `[BG OCR ${stubEntry.id}] échec inattendu : ${this.errorMsg(err)}`,
      );
      // Marquer l'entry comme "analyse échouée" (clear aiProcessingStartedAt
      // + label clair) pour que l'UI ne reste pas coincée en spinner.
      void this.prisma.accountingEntry
        .update({
          where: { id: stubEntry.id },
          data: {
            aiProcessingStartedAt: null,
            label: 'Analyse OCR échouée — saisir manuellement',
          },
        })
        .catch(() => {});
    });

    return {
      extractionId: '',
      entryId: stubEntry.id,
      duplicateOfEntryId: null,
      budgetBlocked: false,
    };
  }

  /**
   * Pipeline IA complet exécuté en arrière-plan APRÈS la création de
   * l'entry stub. Met à jour l'entry et ses lignes quand fini.
   *
   * Toute erreur ici n'impacte plus la réponse HTTP (déjà envoyée). On
   * log seulement et on clear le flag aiProcessingStartedAt pour que
   * l'UI sorte du mode "en cours".
   */
  private async runOcrPipelineInBackground(params: {
    clubId: string;
    userId: string;
    stubEntryId: string;
    mediaAssetIds: string[];
    orderedAssets: Array<{ id: string; mimeType: string }>;
    buffers: Buffer[];
    hashes: string[];
    combinedHash: string;
    primaryAssetId: string;
  }): Promise<void> {
    const {
      clubId,
      userId,
      stubEntryId,
      mediaAssetIds,
      orderedAssets,
      buffers,
      combinedHash,
      primaryAssetId,
    } = params;

    // Setup IA
    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const models = await this.aiSettings.getModels(clubId);
    if (!apiKey || !models.textModel) {
      this.logger.warn(
        `[BG OCR ${stubEntryId}] config IA incomplète, abort`,
      );
      await this.prisma.accountingEntry.update({
        where: { id: stubEntryId },
        data: {
          aiProcessingStartedAt: null,
          label: 'Configuration IA manquante — saisir manuellement',
        },
      });
      return;
    }

    // Prétraitement + tuilage par asset.
    // - Pour chaque page utilisateur, on applique sharp (rotate, normalise,
    //   sharpen, resize 2500px max) sur les images.
    // - Si l'image résultante est très haute (ratio > 2.5×), on la découpe
    //   en tuiles verticales avec chevauchement pour fiabiliser l'OCR sans
    //   perdre les lignes coupées.
    // - Le pipeline IA peut donc recevoir N tuiles internes même si
    //   l'utilisateur a uploadé M < N pages logiques. Le pageCount affiché
    //   reste basé sur le nombre d'assets utilisateur.
    // - Pour les PDFs : on extrait AUSSI le texte natif via pdf-parse et
    //   on le passe au modèle en complément de l'image. Sur un PDF
    //   généré (vs scanné), le texte natif est PARFAIT — bien meilleur
    //   que l'OCR vision. Sur un PDF scanné, pdf-parse retourne vide
    //   → fallback vision pure.
    const dataUrls: string[] = [];
    const pdfTextChunks: string[] = [];
    for (let i = 0; i < orderedAssets.length; i++) {
      const a = orderedAssets[i];
      const pre = await this.preprocessImage(buffers[i], a.mimeType);
      const tiles = await this.tileTallImage(pre.buffer, pre.mimeType);
      for (const tile of tiles) {
        dataUrls.push(this.bufferToDataUrl(tile.buffer, tile.mimeType));
      }
      // Pour les PDFs : tente une extraction texte native
      if (a.mimeType === 'application/pdf') {
        try {
          const parsed = await pdfParse(buffers[i]);
          const text = (parsed.text ?? '').trim();
          if (text.length > 50) {
            pdfTextChunks.push(text.slice(0, 8000));
          }
        } catch {
          // ignore — on a déjà l'image vision
        }
      }
    }
    if (dataUrls.length > orderedAssets.length) {
      this.logger.log(
        `[OCR multi] ${orderedAssets.length} pages utilisateur → ${dataUrls.length} images IA après tuilage`,
      );
    }
    const pdfText = pdfTextChunks.join('\n\n--- PAGE ---\n\n');
    if (pdfText) {
      this.logger.log(
        `[OCR multi] PDF texte natif extrait (${pdfText.length} chars) — boost qualité OCR`,
      );
    }
    const ctx = await this.loadClubContext(clubId);

    // 6. Comptage des pages effectives
    //    - Si 1 PDF : pdf-parse → nb pages réelles
    //    - Si N images : pageCount = N
    //    - Mix : somme (N images + pages PDF)
    let pageCount = 0;
    for (let i = 0; i < orderedAssets.length; i++) {
      const a = orderedAssets[i];
      if (a.mimeType === 'application/pdf') {
        try {
          const parsed = await pdfParse(buffers[i]);
          pageCount += Math.max(1, Math.min(parsed.numpages, 50));
        } catch (err) {
          this.logger.warn(
            `[OCR ${a.id}] pdf-parse échec : ${this.errorMsg(err)}`,
          );
          pageCount += 1;
        }
      } else {
        pageCount += 1;
      }
    }
    pageCount = Math.max(1, Math.min(pageCount, 50));
    if (pageCount > 5) {
      this.logger.warn(
        `[OCR multi] ${pageCount} pages au total — l'IA peut tronquer`,
      );
    }

    const visionModel = pickVisionModel(models.textModel);
    if (visionModel !== models.textModel) {
      this.logger.log(
        `[OCR multi] textModel ${models.textModel} sans vision → fallback ${visionModel}`,
      );
    }

    // 7. Appels 1 + 2 en PARALLÈLE
    let totalCostCents = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastErrorMsg: string | null = null;

    const [ocrRes, expRes] = await Promise.allSettled([
      this.runOcrRaw(apiKey, visionModel, dataUrls, pageCount, pdfText),
      this.runExpertise(apiKey, visionModel, dataUrls, ctx, pageCount, pdfText),
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
      this.logger.warn(`[OCR multi] ${lastErrorMsg}`);
    }

    if (expRes.status === 'fulfilled') {
      expertise = expRes.value.parsed;
      totalCostCents += expRes.value.usage.costCents;
      totalInputTokens += expRes.value.usage.inputTokens;
      totalOutputTokens += expRes.value.usage.outputTokens;
    } else {
      const m = `Expertise failed: ${this.errorMsg(expRes.reason)}`;
      lastErrorMsg = lastErrorMsg ? `${lastErrorMsg} | ${m}` : m;
      this.logger.warn(`[OCR multi] ${m}`);
    }

    // 8. Comparateur
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
        this.logger.warn(`[OCR multi] ${m}`);
      }
    }

    // Fallbacks
    if (!decision) {
      if (expertise) {
        decision = this.expertiseToDecision(expertise, ocrRaw);
      } else if (ocrRaw) {
        decision = this.ocrToDecision(ocrRaw, ctx);
      }
    }

    // 9. Log usage IA cumulé
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

    // 10. Persiste AccountingExtraction (mediaAssetId = primaire)
    const rawWithMeta = ocrRaw
      ? { ...ocrRaw, _combinedHash: combinedHash, _pageMediaIds: mediaAssetIds }
      : { error: lastErrorMsg ?? 'no-result', _combinedHash: combinedHash };
    const extraction = await this.prisma.accountingExtraction.create({
      data: {
        clubId,
        mediaAssetId: primaryAssetId,
        rawJson: JSON.parse(JSON.stringify(rawWithMeta)) as object,
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
          ocrRaw?.pcgAccountCode ?? decision?.lines[0]?.accountCode ?? null,
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
        pageCount,
        error: lastErrorMsg,
      },
    });

    // 11. Met à jour l'entry stub avec la décision finale
    //     (header + remplacement des lignes). On NE CRÉE PAS une nouvelle
    //     entry — on enrichit celle qui existe déjà depuis l'étape 5.
    await this.applyDecisionToEntry(
      clubId,
      stubEntryId,
      extraction.id,
      decision,
    );

    await this.audit.log({
      clubId,
      userId,
      entryId: stubEntryId,
      action: 'UPDATE',
      metadata: {
        source: 'OCR_AI',
        extractionId: extraction.id,
        model: models.textModel,
        costCents: totalCostCents,
        pageCount,
        mediaAssetCount: mediaAssetIds.length,
        pipeline: {
          ocrRawOk: !!ocrRaw,
          expertiseOk: !!expertise,
          comparatorOk: !!decision && !!ocrRaw && !!expertise,
          globalConfidence: decision?.globalConfidencePct ?? null,
        },
      },
    });
  }

  /**
   * Applique la décision IA finale à une entry stub existante : update
   * du header (label, montant, date, paymentMethod, extractionId) +
   * remplacement complet des lignes (delete + create) + clear du flag
   * `aiProcessingStartedAt`.
   *
   * Si `decision` est null (tout le pipeline a échoué) : on clear
   * juste le flag et on met un label explicite — l'utilisateur saisira
   * manuellement.
   */
  private async applyDecisionToEntry(
    clubId: string,
    entryId: string,
    extractionId: string | null,
    decision: CategorizedDecision | null,
  ): Promise<void> {
    const totalCents = decision?.totalTtcCents ?? 0;
    const label = this.buildAutoLabel(decision);
    const date = decision?.date ? new Date(decision.date) : new Date();

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
              sourceLabels: [] as string[],
            },
          ];

    const codes = Array.from(
      new Set([...decisionLines.map((l) => l.accountCode), bankCode]),
    );
    const accounts = await this.prisma.accountingAccount.findMany({
      where: { clubId, code: { in: codes } },
    });
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));

    await this.prisma.$transaction(async (tx) => {
      // 1. Update entry header
      await tx.accountingEntry.update({
        where: { id: entryId },
        data: {
          label,
          amountCents: totalCents,
          occurredAt: date,
          extractionId,
          paymentMethod: decision?.paymentMethod ?? null,
          paymentReference: decision?.paymentReference ?? null,
          aiProcessingStartedAt: null, // pipeline terminé
        },
      });

      // 2. Supprime les anciennes lignes (l'entry stub n'en avait pas
      //    mais par sûreté en cas de retry).
      await tx.accountingEntryLine.deleteMany({
        where: { entryId },
      });

      // 3. Recrée les lignes débit (1 par groupe) + crédit banque
      let sortOrder = 0;
      for (const line of decisionLines) {
        const account = accountByCode.get(line.accountCode);
        if (!account) {
          this.logger.warn(
            `[BG OCR ${entryId}] Compte ${line.accountCode} introuvable, ligne ignorée`,
          );
          continue;
        }
        await tx.accountingEntryLine.create({
          data: {
            entryId,
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
            iaReasoning: line.reasoning?.slice(0, 1500) || null,
            iaConfidencePct: line.confidencePct,
          },
        });
      }
      const bank = accountByCode.get(bankCode);
      if (bank) {
        await tx.accountingEntryLine.create({
          data: {
            entryId,
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
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Appels IA
  // ─────────────────────────────────────────────────────────────────────

  /** Appel 1 — extraction OCR brute (1 ou N images, + texte PDF natif si dispo). */
  private async runOcrRaw(
    apiKey: string,
    model: string,
    dataUrls: string[],
    pageCount: number,
    pdfText: string,
  ): Promise<{
    parsed: OcrRawExtraction | null;
    usage: { costCents: number; inputTokens: number; outputTokens: number };
  }> {
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: this.buildOcrPrompt(pageCount) }];
    // Si on a du texte PDF natif (= PDF généré, pas scanné), on
    // l'inclut comme source de vérité prioritaire. Le modèle utilise
    // l'image en backup pour les éléments visuels (logos, tampons).
    if (pdfText) {
      userContent.push({
        type: 'text',
        text: `\n=== TEXTE PDF NATIF (source prioritaire, sans erreur OCR) ===\n${pdfText}\n=== FIN TEXTE PDF ===\n`,
      });
    }
    // 1 bloc image_url par page — l'IA voit toutes les pages dans
    // l'ordre fourni et les considère comme un document unique.
    for (const url of dataUrls) {
      userContent.push({ type: 'image_url', image_url: { url } });
    }
    const result = await this.openrouter.chatCompletion({
      apiKey,
      model,
      responseFormat: 'json_object',
      messages: [
        {
          role: 'system',
          content:
            'Tu es un OCR comptable spécialisé en factures associatives françaises. Tu réponds UNIQUEMENT en JSON strict, sans markdown ni texte d\'introduction.',
        },
        { role: 'user', content: userContent },
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

  /** Appel 2 — expertise comptable (vision + contexte club + texte PDF natif). */
  private async runExpertise(
    apiKey: string,
    model: string,
    dataUrls: string[],
    ctx: { accounts: Array<{ code: string; label: string }>; projects: Array<{ id: string; title: string }> },
    pageCount: number,
    pdfText: string,
  ): Promise<{
    parsed: AccountingExpertise | null;
    usage: { costCents: number; inputTokens: number; outputTokens: number };
  }> {
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: this.buildExpertisePrompt(ctx, pageCount) }];
    if (pdfText) {
      userContent.push({
        type: 'text',
        text: `\n=== TEXTE PDF NATIF (source prioritaire, sans erreur OCR) ===\n${pdfText}\n=== FIN TEXTE PDF ===\n`,
      });
    }
    for (const url of dataUrls) {
      userContent.push({ type: 'image_url', image_url: { url } });
    }
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
        { role: 'user', content: userContent },
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

  private buildOcrPrompt(pageCount: number): string {
    const multiPageNote =
      pageCount > 1
        ? `\n\n**DOCUMENT MULTI-PAGES** (${pageCount} pages) : analyse TOUTES les pages, le total et les items peuvent être répartis. Le total final est généralement sur la dernière page.\n`
        : '';
    return `Tu reçois une facture / reçu / ticket d'achat français. Extrais les informations littérales (lecture, pas d'interprétation comptable).${multiPageNote}

ZONES TYPIQUES sur une facture FR (sers-toi de ces indices pour fiabiliser la lecture) :
- **vendor** : nom commercial en gros caractères en HAUT (souvent avec logo). Pas la raison sociale juridique du bas (ex. "Decathlon" plutôt que "Decathlon France SAS").
- **invoiceNumber** : "Facture N°", "FACT", "FA-XXXX", "N° de facture", "Référence" — généralement haut/droite. Pas le n° client / SIRET.
- **date** : "Date d'émission", "Le DD/MM/YYYY", "Date facture". Convertis vers YYYY-MM-DD strict (jamais DD/MM ou MM/DD).
- **totalTtcCents** : "Total TTC", "Net à payer", "Montant à régler", "TOTAL". Multiplie par 100 (ex. 42,50 € → 4250).
- **vatCents** : "TVA", "Montant TVA", parfois ventilé par taux. Somme de tous les TVA si plusieurs taux.
- **items** : tableau central de la facture (Quantité × Désignation × PU × Montant). Le montant ligne EST le TTC pour une ligne (ou HT × (1+taux) — privilégie le TTC affiché).

EXEMPLE de sortie pour une facture Decathlon :
{
  "vendor": "Decathlon",
  "invoiceNumber": "FA2604-5575",
  "totalTtcCents": 4460,
  "vatCents": 743,
  "date": "2026-04-15",
  "items": [
    { "description": "Tatami judo 2m × 1m × 4cm", "totalCents": 3500, "suggestedAccountCode": "606300" },
    { "description": "Sifflet arbitrage", "totalCents": 960, "suggestedAccountCode": "606300" }
  ],
  "pcgAccountCode": "606300",
  "paymentMethod": "CARD",
  "paymentReference": null,
  "confidencePerField": {
    "vendor": 0.98, "invoiceNumber": 0.95, "totalTtcCents": 1.0, "date": 0.92, "paymentMethod": 0.85
  }
}

Réponds STRICTEMENT en JSON sur ce schéma :
{
  "vendor": "nom commerçant ou null",
  "invoiceNumber": "n° facture / ticket / reçu ou null",
  "totalTtcCents": "total TTC en centimes (entier) ou null",
  "vatCents": "TVA en centimes si visible ou null",
  "date": "YYYY-MM-DD strict ou null",
  "items": [
    { "description": "...", "totalCents": int, "suggestedAccountCode": "6 chiffres ou null" }
  ],
  "pcgAccountCode": "code PCG global proposé ou null",
  "paymentMethod": "CASH | CHECK | TRANSFER | CARD | DIRECT_DEBIT | OTHER | null",
  "paymentReference": "n° chèque, n° opération virement, etc. ou null",
  "confidencePerField": {
    "vendor": 0-1, "invoiceNumber": 0-1, "totalTtcCents": 0-1, "date": 0-1, "paymentMethod": 0-1
  }
}

CONTRÔLE ARITHMÉTIQUE OBLIGATOIRE :
- La somme des items[].totalCents DOIT être proche de totalTtcCents (tolérance ±5 cts pour arrondis).
- Si la somme ne colle pas → relis attentivement les montants ligne. Souvent l'erreur vient d'un OCR sur une virgule ou un "0" mal lu.

Règles :
- Montants en centimes (×100, jamais en euros décimaux). Pas de récup TVA (asso non-assujettie).
- items[]=[] si la facture n'a pas de détail ligne (ex. ticket simple "TOTAL 12,50 €").
- "paymentMethod" : repère les mentions explicites :
  * CHECK = "chèque", "CHQ", "CHQ N°", "réglé par chèque" → paymentReference = n° de chèque si visible
  * TRANSFER = "virement", "VIR", "VIR SEPA" → paymentReference = n° d'opération si visible
  * CARD = "CB", "carte bancaire", "Visa/Mastercard"
  * CASH = "espèces", "cash", "ESP"
  * DIRECT_DEBIT = "prélèvement", "SEPA Direct Debit"
  * OTHER = autre moyen identifié mais hors liste
  * null si aucune mention claire
- Confiance : 1.0 = lecture certaine (texte parfaitement net), 0.7 = probable mais ambigu, < 0.5 = devine.`;
  }

  private buildExpertisePrompt(
    ctx: {
      accounts: Array<{ code: string; label: string }>;
      projects: Array<{ id: string; title: string }>;
    },
    pageCount: number,
  ): string {
    const multiPageNote =
      pageCount > 1
        ? `\n\n**DOCUMENT MULTI-PAGES** (${pageCount} pages) : examine TOUTES les pages avant de produire la ventilation. Le récap des items et le total peuvent être en fin de document.\n`
        : '';
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

    return `Analyse cette facture en tant qu'expert-comptable d'une association sportive (régime non-assujetti TVA).${multiPageNote}

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
  "paymentMethod": "CASH | CHECK | TRANSFER | CARD | DIRECT_DEBIT | OTHER | null",
  "paymentReference": "n° chèque/virement si lisible, null sinon",
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
- confidencePct = ta confiance dans le compte choisi (pas la lecture).
- paymentMethod : repère "Mode de règlement", "réglé par chèque", "VIR SEPA",
  "CB", "espèces", etc. paymentReference = n° chèque OU n° opération si présent.`;
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
  "paymentMethod": "CASH | CHECK | TRANSFER | CARD | DIRECT_DEBIT | OTHER | null",
  "paymentReference": "string ou null",
  "paymentMethodNeedsManual": bool,
  "globalReasoning": "synthèse en 1-2 phrases — explique les choix et mentionne les divergences éventuelles",
  "globalConfidencePct": int 0-100 (HAUT si les 2 sources convergent, BAS si désaccord majeur),
  "agreement": {
    "vendor": bool,
    "total": bool,
    "date": bool,
    "lines": bool,
    "paymentMethod": bool
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
- agreement.* reflète la concordance OBJECTIVE entre les 2 sources, pas ta confiance.
- paymentMethod :
  * Si OCR et Expertise concordent → choisis cette valeur, paymentMethodNeedsManual = false
  * Si UNE source détecte un mode et l'autre null → retiens la source qui a trouvé,
    paymentMethodNeedsManual = false (un seul indice = suffisant)
  * Si DIVERGENCE (ex. OCR=CHECK, Expertise=TRANSFER) → paymentMethod = null,
    paymentMethodNeedsManual = TRUE (l'utilisateur tranchera)
  * Si AUCUNE source ne détecte → paymentMethod = null,
    paymentMethodNeedsManual = TRUE
- paymentReference : retiens la référence si l'une des 2 sources l'a trouvée
  ET que paymentMethod ∈ {CHECK, TRANSFER, OTHER}.`;
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

  /** Valide une string contre la liste fermée des modes de paiement. */
  private parsePaymentMethod(raw: unknown): PaymentMethod | null {
    if (typeof raw !== 'string') return null;
    const upper = raw.trim().toUpperCase();
    return PAYMENT_METHOD_SET.has(upper) ? (upper as PaymentMethod) : null;
  }

  private parsePaymentReference(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 && trimmed.length < 100 ? trimmed : null;
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
        paymentMethod: this.parsePaymentMethod(parsed.paymentMethod),
        paymentReference: this.parsePaymentReference(parsed.paymentReference),
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
        paymentMethod: this.parsePaymentMethod(parsed.paymentMethod),
        paymentReference: this.parsePaymentReference(parsed.paymentReference),
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

      const paymentMethod = this.parsePaymentMethod(parsed.paymentMethod);
      return {
        vendor: typeof parsed.vendor === 'string' ? parsed.vendor : null,
        invoiceNumber:
          typeof parsed.invoiceNumber === 'string' ? parsed.invoiceNumber : null,
        totalTtcCents:
          typeof parsed.totalTtcCents === 'number'
            ? Math.round(parsed.totalTtcCents)
            : 0,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        paymentMethod,
        paymentReference: this.parsePaymentReference(parsed.paymentReference),
        // Force `needsManual` à true si l'IA n'a pas trouvé de mode,
        // même si elle prétendait le contraire (sécurité contre les
        // hallucinations LLM qui mettent paymentMethod=null mais oublient
        // de cocher needsManual=true).
        paymentMethodNeedsManual:
          paymentMethod === null || parsed.paymentMethodNeedsManual === true,
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
          paymentMethod: agreementRaw.paymentMethod === true,
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
    const paymentMethod = exp.paymentMethod ?? ocrRaw?.paymentMethod ?? null;
    return {
      vendor: exp.vendor ?? ocrRaw?.vendor ?? null,
      invoiceNumber: exp.invoiceNumber ?? ocrRaw?.invoiceNumber ?? null,
      totalTtcCents: exp.totalTtcCents ?? ocrRaw?.totalTtcCents ?? 0,
      date: exp.date ?? ocrRaw?.date ?? null,
      paymentMethod,
      paymentReference:
        exp.paymentReference ?? ocrRaw?.paymentReference ?? null,
      // Pas de comparateur → si une seule source a vu le mode, on
      // demande quand même validation manuelle (pas de cross-check).
      paymentMethodNeedsManual: paymentMethod === null,
      globalReasoning: exp.globalReasoning,
      globalConfidencePct: Math.max(0, exp.globalConfidencePct - 10), // pénalité (pas de comparaison)
      agreement: {
        vendor: false,
        total: false,
        date: false,
        lines: false,
        paymentMethod: false,
      },
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
      paymentMethod: raw.paymentMethod,
      paymentReference: raw.paymentReference,
      paymentMethodNeedsManual: raw.paymentMethod === null,
      globalReasoning:
        'Catégorisation depuis OCR brut uniquement (expertise IA non disponible).',
      globalConfidencePct: 40,
      agreement: {
        vendor: false,
        total: false,
        date: false,
        lines: false,
        paymentMethod: false,
      },
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
    mediaAssetIds: string[],
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
          paymentMethod: decision?.paymentMethod ?? null,
          paymentReference: decision?.paymentReference ?? null,
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
            // 1500 chars permet de garder l'argumentation complète de l'IA
            // (avec contexte du club, comparaison entre comptes, etc.)
            // sans bloater la table — le client tronque visuellement avec
            // un toggle "voir plus".
            iaReasoning: line.reasoning?.slice(0, 1500) || null,
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

      // Documents attachés (1 AccountingDocument par page média).
      // L'ordre est conservé : page 1 = mediaAssetIds[0], etc.
      for (const mediaAssetId of mediaAssetIds) {
        await tx.accountingDocument.create({
          data: {
            clubId,
            entryId: e.id,
            mediaAssetId,
            kind: 'RECEIPT',
          },
        });
      }
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

  /**
   * Prétraitement d'une image avant envoi au modèle vision pour améliorer
   * la fiabilité de l'OCR :
   *
   *  1. **EXIF auto-rotate** — corrige les photos prises en mode portrait
   *     mais stockées avec metadata d'orientation (très commun en mobile).
   *  2. **Normalisation** — étire l'histogramme (auto-contraste). Une photo
   *     prise dans une pièce sombre devient nettement plus lisible.
   *  3. **Netteté légère** — `sharpen(sigma=1)` rehausse les bords du texte
   *     sans amplifier le bruit (paramètres calibrés empiriquement).
   *  4. **Resize max 2500px** — au-delà c'est inutile pour la lecture +
   *     ça consomme des tokens vision pour rien.
   *  5. **JPEG quality 90** — taille raisonnable et qualité largement
   *     suffisante pour l'OCR.
   *
   * Pour les PDFs et autres mime non-image : retourne le buffer tel quel
   * (sharp ne décode pas les PDFs ; le modèle vision les gère
   * directement, et appliquer une autre transformation casserait le
   * fichier).
   *
   * Retourne : `{ buffer, mimeType }` — le mime peut basculer
   * `image/png` → `image/jpeg` après resize/recompression.
   */
  private async preprocessImage(
    buf: Buffer,
    mimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!mimeType.startsWith('image/')) {
      return { buffer: buf, mimeType };
    }
    try {
      // Pipeline sharp en 2 passes :
      // 1. rotate EXIF + resize → image "raisonnable"
      // 2. analyse stats (luminosité moyenne) pour décider gamma + contraste
      // 3. sharpen final (texte net) + JPEG haute qualité
      const stage1 = sharp(buf)
        .rotate()
        .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true });
      const stats = await stage1.stats();
      // Luminosité moyenne (pondérée RGB) — indique si l'image est sombre
      const meanLum =
        stats.channels.length >= 3
          ? (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3
          : stats.channels[0].mean;
      // Si image sombre (< 110 sur 255), on applique un gamma > 1 pour
      // éclaircir les zones moyennes. Si déjà bien exposée, on touche pas.
      const gamma = meanLum < 110 ? 1.3 : meanLum < 140 ? 1.1 : 1.0;
      // Coefficient de contraste — image plate (faible variance) → boost.
      const meanStdDev =
        stats.channels.length >= 3
          ? (stats.channels[0].stdev + stats.channels[1].stdev + stats.channels[2].stdev) / 3
          : stats.channels[0].stdev;
      const linearMul = meanStdDev < 40 ? 1.2 : 1.0;

      const out = await sharp(buf)
        .rotate()
        .resize(2500, 2500, { fit: 'inside', withoutEnlargement: true })
        .gamma(gamma)
        .linear(linearMul, -(linearMul - 1) * 128) // boost contraste autour du gris moyen
        .normalise() // auto-stretch histogramme final
        .sharpen({ sigma: 1.2, m1: 0.6, m2: 2.5 }) // un peu plus marqué
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      this.logger.log(
        `[OCR] preprocess gamma=${gamma} contrastMul=${linearMul.toFixed(2)} (lum=${meanLum.toFixed(0)} stdev=${meanStdDev.toFixed(0)})`,
      );
      return { buffer: out, mimeType: 'image/jpeg' };
    } catch (err) {
      this.logger.warn(
        `[OCR] preprocessImage échec, on envoie l'original : ${this.errorMsg(err)}`,
      );
      return { buffer: buf, mimeType };
    }
  }

  /**
   * Découpe une image très haute (ratio H/W > 2.5 — ticket de caisse,
   * relevé long) en tuiles verticales avec chevauchement, pour que le
   * modèle vision puisse lire chaque section sans perte de détail. La
   * taille de chaque tuile reste inférieure à 2500px en hauteur.
   *
   * Si l'image n'est pas "tall" → retourne `[buffer]` (pas de tuilage).
   *
   * Le pageCount logique côté DB ne change pas — c'est un découpage
   * INTERNE pour l'IA seule.
   */
  private async tileTallImage(
    buf: Buffer,
    mimeType: string,
  ): Promise<Array<{ buffer: Buffer; mimeType: string }>> {
    if (!mimeType.startsWith('image/')) {
      return [{ buffer: buf, mimeType }];
    }
    try {
      const meta = await sharp(buf).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      // Pas de tuilage si pas tall ou si dimensions inconnues
      if (w === 0 || h === 0 || h <= w * 2.5 || h <= 2500) {
        return [{ buffer: buf, mimeType }];
      }
      const tileHeight = Math.min(2200, Math.ceil(h / 2));
      const overlap = 200; // px de chevauchement pour capturer les lignes coupées
      const tiles: Array<{ buffer: Buffer; mimeType: string }> = [];
      let y = 0;
      while (y < h) {
        const cropH = Math.min(tileHeight, h - y);
        const tile = await sharp(buf)
          .extract({ left: 0, top: y, width: w, height: cropH })
          .jpeg({ quality: 90 })
          .toBuffer();
        tiles.push({ buffer: tile, mimeType: 'image/jpeg' });
        if (y + cropH >= h) break;
        y += tileHeight - overlap;
      }
      this.logger.log(
        `[OCR] image tall (${w}x${h}) → ${tiles.length} tuiles`,
      );
      return tiles;
    } catch (err) {
      this.logger.warn(
        `[OCR] tileTallImage échec, on envoie l'image entière : ${this.errorMsg(err)}`,
      );
      return [{ buffer: buf, mimeType }];
    }
  }
}
