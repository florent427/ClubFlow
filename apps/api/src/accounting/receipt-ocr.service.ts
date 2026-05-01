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

/**
 * Article extrait sur une facture (1 ligne du détail vendor).
 * - `description` : libellé brut (ex. "Tatamis 2x1m").
 * - `totalCents`  : montant TTC de l'article (TVA INCLUSE — l'asso ne
 *   sépare pas la TVA car non récupérable).
 * - `suggestedAccountCode` : compte PCG proposé par l'IA pour CET item
 *   spécifique. C'est ce qui permet la séparation auto en sous-lignes.
 */
interface OcrItem {
  description: string;
  totalCents: number | null;
  suggestedAccountCode: string | null;
}

interface OcrExtracted {
  vendor: string | null;
  invoiceNumber: string | null;
  totalTtcCents: number | null;
  /** Stocké pour info mais ignoré par défaut (asso = pas de récup TVA). */
  vatCents: number | null;
  date: string | null; // ISO
  items: OcrItem[];
  /** Compte PCG global proposé pour TOUTE la facture (fallback si items vides). */
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
 *   4. Parse JSON strict (extraction enrichie : items détaillés + n° facture)
 *   5. Persiste AccountingExtraction + crée AccountingEntry NEEDS_REVIEW
 *
 * Spécificités association :
 * - **Pas de TVA** : on stocke `vatCents` pour info mais on ne crée PAS
 *   de ligne TVA séparée. Le montant débit = montant TTC complet.
 * - **Label auto** : `"{n°facture} — {vendor}"` (ou `vendor` seul si pas
 *   de n° de facture, ou `"Reçu à qualifier"` en dernier recours).
 * - **Séparation auto en sous-lignes** : si l'IA propose ≥ 2 codes
 *   comptables différents pour les items, on crée 1 ligne débit par
 *   compte (somme des items du même compte). Si tous les items partagent
 *   le même compte (ou s'il n'y a pas d'items détaillés), 1 seule ligne
 *   débit avec le total.
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
        maxTokens: 2500,
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
        extractedInvoiceNumber: extracted?.invoiceNumber ?? null,
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

  /**
   * Construit le label automatique de l'écriture :
   * - Si n° facture + vendor → `"{n°} — {vendor}"`
   * - Si vendor seul → `"{vendor}"`
   * - Sinon → `"Reçu à qualifier"`
   */
  private buildAutoLabel(extracted: OcrExtracted | null | undefined): string {
    if (!extracted) return 'Reçu à qualifier';
    const inv = extracted.invoiceNumber?.trim();
    const ven = extracted.vendor?.trim();
    if (inv && ven) return `${inv} — ${ven}`;
    if (ven) return ven;
    if (inv) return `Facture ${inv}`;
    return 'Reçu à qualifier';
  }

  /**
   * Calcule la ventilation des sous-lignes débit en fonction des items
   * extraits. Retourne un tableau de groupes, chacun = 1 ligne débit
   * future (avec compte PCG, montant total, libellés sources).
   *
   * Règles :
   * - Items ayant un `suggestedAccountCode` non null sont groupés par code.
   * - Items sans code (null) tombent dans le groupe `fallbackAccount`.
   * - Si tous les items se retrouvent dans UN SEUL groupe (même compte),
   *   on retourne 1 seul groupe avec le label "facture entière" (pas de
   *   détail).
   * - Si pas d'items du tout : 1 seul groupe avec `fallbackAccount` et
   *   le total complet, sans labels d'items.
   */
  private buildLineGroups(
    extracted: OcrExtracted | null | undefined,
    fallbackAccount: string,
    totalCents: number,
  ): Array<{
    accountCode: string;
    amountCents: number;
    sourceLabels: string[];
  }> {
    const items = extracted?.items ?? [];
    const validItems = items.filter(
      (it) => it && it.totalCents !== null && it.totalCents > 0,
    );

    // Pas d'items détaillés OU items sans montants → 1 seule ligne
    if (validItems.length === 0) {
      const code = extracted?.pcgAccountCode ?? fallbackAccount;
      return [
        {
          accountCode: code,
          amountCents: totalCents,
          sourceLabels: [],
        },
      ];
    }

    // Group by accountCode (null → fallback)
    const buckets = new Map<
      string,
      { amountCents: number; sourceLabels: string[] }
    >();
    for (const it of validItems) {
      const code =
        it.suggestedAccountCode ??
        extracted?.pcgAccountCode ??
        fallbackAccount;
      const bucket = buckets.get(code) ?? {
        amountCents: 0,
        sourceLabels: [],
      };
      bucket.amountCents += it.totalCents ?? 0;
      bucket.sourceLabels.push(it.description);
      buckets.set(code, bucket);
    }

    // Réconcilie un éventuel écart de centimes vs total déclaré : on
    // ajuste le PLUS GROS bucket (typique : arrondi sur la dernière ligne).
    const sumItems = Array.from(buckets.values()).reduce(
      (s, b) => s + b.amountCents,
      0,
    );
    const diff = totalCents - sumItems;
    if (diff !== 0 && buckets.size > 0) {
      const biggest = Array.from(buckets.entries()).sort(
        (a, b) => b[1].amountCents - a[1].amountCents,
      )[0];
      biggest[1].amountCents += diff;
    }

    // Si un seul bucket → on retourne 1 ligne SANS détail d'articles
    // (cas "facture unique totale sans articles" demandé : pas la peine
    // de polluer les libellés ligne par ligne).
    if (buckets.size === 1) {
      const [code, bucket] = Array.from(buckets.entries())[0];
      return [
        {
          accountCode: code,
          amountCents: bucket.amountCents,
          sourceLabels: [],
        },
      ];
    }

    // Sinon ventilation par compte
    return Array.from(buckets.entries()).map(([code, bucket]) => ({
      accountCode: code,
      amountCents: bucket.amountCents,
      sourceLabels: bucket.sourceLabels,
    }));
  }

  private async createStubEntry(
    clubId: string,
    userId: string,
    mediaAssetId: string,
    extraction: { id: string } | null,
    extracted?: OcrExtracted | null,
  ) {
    // Total = TTC déclaré sur la facture (asso = pas de séparation TVA).
    // On ignore vatCents pour le calcul des lignes débit.
    const totalCents = extracted?.totalTtcCents ?? 0;
    const label = this.buildAutoLabel(extracted);
    const date = extracted?.date ? new Date(extracted.date) : new Date();

    const fallbackCode = await this.mapping.resolveAccountCode(
      clubId,
      'EXPENSE_GENERIC',
    );
    const bankCode = await this.mapping.resolveAccountCode(
      clubId,
      'BANK_ACCOUNT',
    );

    // Construit la ventilation des lignes débit (1 ou N selon items).
    const groups = this.buildLineGroups(extracted, fallbackCode, totalCents);

    // Pré-charge les libellés des comptes utilisés (pour stocker accountLabel)
    const codes = Array.from(
      new Set([...groups.map((g) => g.accountCode), bankCode]),
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

      // Lignes débit (1 par compte distinct)
      let sortOrder = 0;
      for (const group of groups) {
        const account = accountByCode.get(group.accountCode);
        if (!account) {
          this.logger.warn(
            `[Stub ${e.id}] Compte ${group.accountCode} introuvable, ligne ignorée`,
          );
          continue;
        }
        // Si on a regroupé plusieurs items dans cette ligne, on stocke
        // leurs libellés dans `mergedFromArticleLabels` pour la traçabilité.
        const lineLabel =
          group.sourceLabels.length > 0
            ? group.sourceLabels.slice(0, 3).join(' · ') +
              (group.sourceLabels.length > 3
                ? ` (+${group.sourceLabels.length - 3})`
                : '')
            : null;
        await tx.accountingEntryLine.create({
          data: {
            entryId: e.id,
            clubId,
            accountCode: account.code,
            accountLabel: account.label,
            label: lineLabel,
            side: AccountingLineSide.DEBIT,
            debitCents: group.amountCents,
            creditCents: 0,
            sortOrder: sortOrder++,
            mergedFromArticleLabels: group.sourceLabels,
            iaSuggestedAccountCode: group.accountCode,
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

  private buildPrompt(): string {
    return `Analyse l'image de ce reçu ou facture et extrais les informations en JSON strict.

CONTEXTE : Association sportive française. **Pas de récupération de TVA** (régime non-assujetti). Tous les montants sont en centimes d'euros (multiplier par 100). Les sous-lignes "items" doivent être en TTC (TVA comprise).

Format JSON attendu :

{
  "vendor": "nom du fournisseur ou enseigne (string ou null)",
  "invoiceNumber": "numéro de facture / ticket / reçu (string ou null si absent)",
  "totalTtcCents": "montant total TTC en centimes (integer ou null)",
  "vatCents": "montant TVA en centimes si visible (integer ou null) — informatif seulement",
  "date": "date d'émission ISO 8601 (YYYY-MM-DD) ou null",
  "items": [
    {
      "description": "libellé de l'article ou prestation",
      "totalCents": "montant TTC de cette ligne en centimes (integer)",
      "suggestedAccountCode": "code PCG le plus adapté à CET item parmi la liste ci-dessous, ou null si incertain"
    }
  ],
  "pcgAccountCode": "code PCG global (fallback si items absents ou tous incertains)",
  "confidencePerField": {
    "vendor": "0 à 1",
    "invoiceNumber": "0 à 1",
    "totalTtcCents": "0 à 1",
    "date": "0 à 1",
    "pcgAccountCode": "0 à 1"
  }
}

Plan comptable associatif (choisir le code le plus précis par item) :
- 606100 Fournitures eau, énergie
- 606300 Petit équipement / matériel sportif consommable
- 606400 Fournitures administratives (papeterie, encre)
- 606800 Autres fournitures
- 613200 Locations immobilières (salle, gymnase)
- 613500 Locations matériel sportif
- 615000 Entretien et réparations
- 618000 Cotisations fédérales / affiliations
- 622600 Honoraires (intervenant, prestataire)
- 624000 Déplacements, transports, hôtellerie
- 625100 Frais de bénévoles (remboursements)
- 626000 Téléphone, frais postaux
- 627000 Frais bancaires
- 628100 Cotisations diverses

Règles strictes :
- Retourne UNIQUEMENT un objet JSON valide, AUCUN texte avant/après.
- Si un champ n'est pas lisible : null (pas 0, pas "").
- "items" peut être [] si la facture n'a pas de détail (ex. ticket commerçant simple).
- Pour CHAQUE item, propose le compte le plus pertinent. Exemple : sur une facture qui contient à la fois des tatamis (606300) et des fournitures bureau (606400), répartis correctement.
- "totalCents" sur chaque item = TTC (TVA comprise), même si la facture affiche HT séparément.
- La somme des "items[].totalCents" doit être proche de "totalTtcCents" (tolérer ±0.02 € pour arrondis).`;
  }

  private parseOcrJson(content: string): OcrExtracted | null {
    try {
      // Nettoie les fences markdown si présentes
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
      const items: OcrItem[] = itemsRaw
        .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
        .map((it) => ({
          description:
            typeof it.description === 'string' && it.description.length > 0
              ? it.description
              : 'Article',
          totalCents:
            typeof it.totalCents === 'number' && Number.isFinite(it.totalCents)
              ? Math.round(it.totalCents)
              : null,
          suggestedAccountCode:
            typeof it.suggestedAccountCode === 'string' &&
            it.suggestedAccountCode.length >= 4
              ? it.suggestedAccountCode
              : null,
        }));
      return {
        vendor:
          typeof parsed.vendor === 'string' && parsed.vendor.length > 0
            ? parsed.vendor
            : null,
        invoiceNumber:
          typeof parsed.invoiceNumber === 'string' &&
          parsed.invoiceNumber.length > 0
            ? parsed.invoiceNumber
            : null,
        totalTtcCents:
          typeof parsed.totalTtcCents === 'number'
            ? Math.round(parsed.totalTtcCents)
            : null,
        vatCents:
          typeof parsed.vatCents === 'number'
            ? Math.round(parsed.vatCents)
            : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        items,
        pcgAccountCode:
          typeof parsed.pcgAccountCode === 'string'
            ? parsed.pcgAccountCode
            : null,
        confidencePerField:
          typeof parsed.confidencePerField === 'object' &&
          parsed.confidencePerField !== null
            ? (parsed.confidencePerField as Record<string, number>)
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
