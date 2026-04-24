import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  AiUsageFeature,
} from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { AiBudgetService } from '../ai/ai-budget.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { OpenrouterService } from '../ai/openrouter.service';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingMappingService } from './accounting-mapping.service';

interface OcrExtracted {
  vendor: string | null;
  totalTtcCents: number | null;
  vatCents: number | null;
  date: string | null; // ISO
  items: string[];
  pcgAccountCode: string | null;
  confidencePerField: Record<string, number>;
}

/**
 * Pipeline OCR / extraction IA pour les reçus et factures.
 *
 * Flow :
 *   1. Lire le MediaAsset (image ou PDF)
 *   2. Hash SHA-256 → check doublon (même fichier uploadé 2×)
 *   3. Appel OpenRouter vision avec prompt FR structuré
 *   4. Parse JSON strict
 *   5. Persiste AccountingExtraction + crée AccountingEntry NEEDS_REVIEW
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
   * Lance l'extraction OCR sur un `MediaAsset` déjà uploadé. Retourne
   * l'id de l'AccountingExtraction créée (et de l'AccountingEntry
   * NEEDS_REVIEW associée si succès).
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

    // 1. Hash du fichier pour déduplication
    let sha256 = asset.sha256;
    if (!sha256 && fs.existsSync(asset.storagePath)) {
      const buf = fs.readFileSync(asset.storagePath);
      sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      await this.prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { sha256 },
      });
    }

    // 2. Dédup par hash : si une extraction existe déjà sur un fichier
    //    avec même sha256, on renvoie l'entry existante (warning côté UI).
    if (sha256) {
      const dupAsset = await this.prisma.mediaAsset.findFirst({
        where: {
          clubId,
          sha256,
          id: { not: asset.id },
        },
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

    // 3. Check budget IA
    const budget = await this.aiBudget.checkBudget(clubId);
    if (!budget.allowed) {
      this.logger.warn(
        `Club ${clubId} a dépassé son budget IA mensuel, OCR fallback manuel.`,
      );
      // Crée quand même une entry NEEDS_REVIEW vide (sans extraction) pour
      // que l'utilisateur puisse saisir à la main et conserver le doc.
      const entry = await this.createStubEntry(
        clubId,
        userId,
        mediaAssetId,
        null,
      );
      return {
        extractionId: '',
        entryId: entry.id,
        duplicateOfEntryId: null,
        budgetBlocked: true,
      };
    }

    // 4. Appel IA (OpenRouter vision)
    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const models = await this.aiSettings.getModels(clubId);
    if (!apiKey || !models.textModel) {
      throw new BadRequestException(
        'Configuration IA du club incomplète (clé OpenRouter / modèle texte manquant).',
      );
    }

    const dataUrl = this.mediaAssetToDataUrl(asset);
    const prompt = this.buildPrompt();

    let result: Awaited<ReturnType<typeof this.openrouter.chatCompletion>>;
    let extracted: OcrExtracted | null = null;
    let errorMsg: string | null = null;

    try {
      result = await this.openrouter.chatCompletion({
        apiKey,
        model: models.textModel,
        responseFormat: 'json_object',
        messages: [
          {
            role: 'system',
            content:
              'Tu es un assistant comptable spécialisé dans les associations sportives françaises. Tu réponds uniquement en JSON strict.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        maxTokens: 1500,
      });
      extracted = this.parseOcrJson(result.content);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `OCR échec pour asset ${mediaAssetId} : ${errorMsg}`,
      );
      result = {
        content: '{}',
        inputTokens: 0,
        outputTokens: 0,
        model: models.textModel,
        costCents: 0,
      };
    }

    // 5. Log usage
    const costCents = result.costCents ?? 0;
    await this.aiSettings.logUsage({
      clubId,
      userId,
      feature: AiUsageFeature.RECEIPT_OCR,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      imagesGenerated: 0,
      costCents,
    });
    await this.aiBudget.incrementUsage(
      clubId,
      AiUsageFeature.RECEIPT_OCR,
      costCents,
      result.inputTokens,
      result.outputTokens,
    );

    // 6. Persiste AccountingExtraction
    const extraction = await this.prisma.accountingExtraction.create({
      data: {
        clubId,
        mediaAssetId,
        rawJson: (extracted
          ? JSON.parse(JSON.stringify(extracted))
          : { error: errorMsg ?? 'parse-failed' }) as object,
        confidencePerField: (extracted?.confidencePerField ?? {}) as object,
        extractedTotalCents: extracted?.totalTtcCents ?? null,
        extractedVatCents: extracted?.vatCents ?? null,
        extractedDate: extracted?.date ? new Date(extracted.date) : null,
        extractedVendor: extracted?.vendor ?? null,
        extractedAccountCode: extracted?.pcgAccountCode ?? null,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costCents,
        pageCount: 1,
        error: errorMsg,
      },
    });

    // 7. Crée l'AccountingEntry NEEDS_REVIEW
    const entry = await this.createStubEntry(
      clubId,
      userId,
      mediaAssetId,
      extraction,
      extracted,
    );

    await this.audit.log({
      clubId,
      userId,
      entryId: entry.id,
      action: 'CREATE',
      metadata: {
        source: 'OCR_AI',
        extractionId: extraction.id,
        model: result.model,
        costCents,
      },
    });

    return {
      extractionId: extraction.id,
      entryId: entry.id,
      duplicateOfEntryId: null,
      budgetBlocked: false,
    };
  }

  private async createStubEntry(
    clubId: string,
    userId: string,
    mediaAssetId: string,
    extraction: { id: string } | null,
    extracted?: OcrExtracted | null,
  ) {
    const amount = extracted?.totalTtcCents ?? 0;
    const label =
      extracted?.vendor && extracted.totalTtcCents
        ? `${extracted.vendor} — ${(extracted.totalTtcCents / 100).toFixed(2)} €`
        : 'Reçu à qualifier';
    const date = extracted?.date ? new Date(extracted.date) : new Date();
    const accountCode =
      extracted?.pcgAccountCode ??
      (await this.mapping.resolveAccountCode(clubId, 'EXPENSE_GENERIC'));
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: accountCode } },
    });
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );
    const bank = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code: bankCode } },
    });

    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.EXPENSE,
          status: AccountingEntryStatus.NEEDS_REVIEW,
          source: AccountingEntrySource.OCR_AI,
          label,
          amountCents: amount,
          occurredAt: date,
          createdByUserId: userId,
          extractionId: extraction?.id ?? null,
        },
      });
      // Ligne 1 : débit charge (proposition IA)
      if (account) {
        await tx.accountingEntryLine.create({
          data: {
            entryId: e.id,
            clubId,
            accountCode: account.code,
            accountLabel: account.label,
            side: AccountingLineSide.DEBIT,
            debitCents: amount,
            creditCents: 0,
            sortOrder: 0,
          },
        });
      }
      // Ligne 2 : crédit banque (contrepartie)
      if (bank) {
        await tx.accountingEntryLine.create({
          data: {
            entryId: e.id,
            clubId,
            accountCode: bank.code,
            accountLabel: bank.label,
            side: AccountingLineSide.CREDIT,
            debitCents: 0,
            creditCents: amount,
            sortOrder: 1,
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

  private buildPrompt(): string {
    return `Analyse l'image de ce reçu ou facture et extrais les informations suivantes en JSON strict :

{
  "vendor": "nom du fournisseur ou enseigne (string ou null)",
  "totalTtcCents": "montant total TTC en centimes d'euros (integer ou null)",
  "vatCents": "montant TVA en centimes (integer ou null)",
  "date": "date en ISO 8601 (YYYY-MM-DD) ou null",
  "items": ["description ligne 1", "ligne 2", ...],
  "pcgAccountCode": "code comptable PCG associatif proposé (6 chiffres), parmi :\\n    - 606100 Fournitures eau/énergie\\n    - 606300 Petit équipement\\n    - 606400 Fournitures administratives\\n    - 606800 Autres fournitures\\n    - 613200 Location salle/immeuble\\n    - 613500 Location matériel sportif\\n    - 615000 Entretien\\n    - 618000 Cotisations fédérales\\n    - 622600 Honoraires prestations\\n    - 624000 Déplacements/transports\\n    - 625100 Frais bénévoles\\n    - 626000 Téléphone/postaux\\n    - 627000 Frais bancaires\\n    Choisis le code le plus adapté, ou null si incertain.",
  "confidencePerField": {
    "vendor": "score 0-1",
    "totalTtcCents": "score 0-1",
    "date": "score 0-1",
    "pcgAccountCode": "score 0-1"
  }
}

Règles strictes :
- Retourne UNIQUEMENT un objet JSON valide, sans texte avant/après.
- Si un champ n'est pas lisible ou absent, utilise null (pas 0, pas "").
- Les montants DOIVENT être en centimes (multiplier par 100).
- Les scores de confiance reflètent ta certitude sur la lecture (0 = deviné, 1 = certain).`;
  }

  private parseOcrJson(content: string): OcrExtracted | null {
    try {
      // Nettoie les fences markdown si présentes
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned) as OcrExtracted;
      return {
        vendor:
          typeof parsed.vendor === 'string' && parsed.vendor.length > 0
            ? parsed.vendor
            : null,
        totalTtcCents:
          typeof parsed.totalTtcCents === 'number'
            ? parsed.totalTtcCents
            : null,
        vatCents:
          typeof parsed.vatCents === 'number' ? parsed.vatCents : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        pcgAccountCode:
          typeof parsed.pcgAccountCode === 'string'
            ? parsed.pcgAccountCode
            : null,
        confidencePerField:
          typeof parsed.confidencePerField === 'object' &&
          parsed.confidencePerField !== null
            ? parsed.confidencePerField
            : {},
      };
    } catch (err) {
      this.logger.warn(
        `Parse OCR JSON échec : ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private mediaAssetToDataUrl(asset: {
    storagePath: string;
    mimeType: string;
  }): string {
    if (!fs.existsSync(asset.storagePath)) {
      throw new BadRequestException('Fichier source introuvable sur disque.');
    }
    const buf = fs.readFileSync(asset.storagePath);
    const base64 = buf.toString('base64');
    // Pour les PDF → on pourrait convertir en PNG via pdfjs-dist, mais
    // v1 : on envoie tel quel, le modèle vision rejettera si non supporté.
    return `data:${asset.mimeType};base64,${base64}`;
  }
}
