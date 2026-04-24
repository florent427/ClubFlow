import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiUsageFeature } from '@prisma/client';
import { AiBudgetService } from '../ai/ai-budget.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { OpenrouterService } from '../ai/openrouter.service';
import { PrismaService } from '../prisma/prisma.service';

export interface SuggestionInput {
  label: string;
  amountCents?: number | null;
  kind?: 'INCOME' | 'EXPENSE' | 'IN_KIND';
}

export interface SuggestionResult {
  accountCode: string | null;
  accountLabel: string | null;
  cohortCode: string | null;
  projectId: string | null;
  projectTitle: string | null;
  disciplineCode: string | null;
  confidencePerField: {
    accountCode?: number;
    cohortCode?: number;
    projectId?: number;
    disciplineCode?: number;
  };
  reasoning: string | null;
  budgetBlocked: boolean;
}

/**
 * Service de catégorisation IA : à partir d'un libellé (ex "Tatamis")
 * et d'un montant, propose le compte PCG, la cohorte analytique, le
 * projet (parmi les projets actifs du club) et la discipline.
 *
 * Utilise OpenRouter (text-only, pas de vision) avec un prompt FR
 * structuré qui inclut le plan comptable curated du club + les projets
 * actifs + la liste des cohortes.
 *
 * Le user valide dans l'UI avec un panel "IA suggère → accepter /
 * ignorer" chaque champ.
 */
@Injectable()
export class AccountingSuggestionService {
  private readonly logger = new Logger(AccountingSuggestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSettings: AiSettingsService,
    private readonly aiBudget: AiBudgetService,
    private readonly openrouter: OpenrouterService,
  ) {}

  async suggest(
    clubId: string,
    input: SuggestionInput,
  ): Promise<SuggestionResult> {
    const trimmed = input.label.trim();
    if (trimmed.length < 3) {
      // Libellé trop court pour une suggestion pertinente
      return this.emptyResult();
    }

    // Check budget IA — si hard cap atteint, on retourne une suggestion vide
    const budget = await this.aiBudget.checkBudget(clubId);
    if (!budget.allowed) {
      this.logger.warn(
        `Club ${clubId} a dépassé son budget IA, suggestion catégorisation indisponible.`,
      );
      return { ...this.emptyResult(), budgetBlocked: true };
    }

    const [accounts, cohorts, projects] = await Promise.all([
      this.prisma.accountingAccount.findMany({
        where: { clubId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { code: true, label: true, kind: true },
      }),
      this.prisma.accountingCohort.findMany({
        where: { clubId },
        orderBy: { sortOrder: 'asc' },
        select: { code: true, label: true },
      }),
      this.prisma.clubProject.findMany({
        where: { clubId, status: { in: ['PLANNED', 'ACTIVE'] } },
        select: { id: true, title: true, summary: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    if (accounts.length === 0) {
      // Plan comptable pas encore seedé — on renvoie une suggestion vide
      // plutôt que d'appeler l'IA inutilement.
      return this.emptyResult();
    }

    // Filtre comptes selon kind si fourni
    const relevantAccounts =
      input.kind === 'INCOME'
        ? accounts.filter((a) => a.kind === 'INCOME' || a.kind === 'ASSET')
        : input.kind === 'EXPENSE'
          ? accounts.filter((a) => a.kind === 'EXPENSE' || a.kind === 'ASSET')
          : input.kind === 'IN_KIND'
            ? accounts.filter((a) => a.kind === 'NEUTRAL_IN_KIND')
            : accounts;

    const apiKey = await this.aiSettings.getDecryptedApiKey(clubId);
    const models = await this.aiSettings.getModels(clubId);

    const prompt = this.buildPrompt(
      trimmed,
      input.amountCents ?? null,
      input.kind ?? null,
      relevantAccounts,
      cohorts,
      projects,
    );

    try {
      const result = await this.openrouter.chatCompletion({
        apiKey,
        model: models.textModel,
        responseFormat: 'json_object',
        temperature: 0.1,
        maxTokens: 600,
        messages: [
          {
            role: 'system',
            content:
              'Tu es un assistant comptable spécialisé dans les associations sportives françaises. Tu réponds uniquement en JSON strict.',
          },
          { role: 'user', content: prompt },
        ],
      });

      // Log usage
      const costCents = result.costCents ?? 0;
      await this.aiSettings.logUsage({
        clubId,
        feature: AiUsageFeature.RECEIPT_OCR, // réutilise la feature OCR pour tracking
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

      const parsed = this.parseJson(result.content);
      if (!parsed) return this.emptyResult();

      const accountCode =
        typeof parsed.accountCode === 'string' ? parsed.accountCode : null;
      const matchedAccount = accountCode
        ? relevantAccounts.find((a) => a.code === accountCode)
        : null;

      const projectId =
        typeof parsed.projectId === 'string' ? parsed.projectId : null;
      const matchedProject = projectId
        ? projects.find((p) => p.id === projectId)
        : null;

      return {
        accountCode: matchedAccount?.code ?? null,
        accountLabel: matchedAccount?.label ?? null,
        cohortCode:
          typeof parsed.cohortCode === 'string' &&
          cohorts.some((c) => c.code === parsed.cohortCode)
            ? parsed.cohortCode
            : null,
        projectId: matchedProject?.id ?? null,
        projectTitle: matchedProject?.title ?? null,
        disciplineCode:
          typeof parsed.disciplineCode === 'string'
            ? parsed.disciplineCode.toLowerCase().trim() || null
            : null,
        confidencePerField:
          typeof parsed.confidencePerField === 'object' &&
          parsed.confidencePerField !== null
            ? (parsed.confidencePerField as SuggestionResult['confidencePerField'])
            : {},
        reasoning:
          typeof parsed.reasoning === 'string'
            ? parsed.reasoning.slice(0, 300)
            : null,
        budgetBlocked: false,
      };
    } catch (err) {
      this.logger.warn(
        `Suggestion IA échec pour "${trimmed}" : ${err instanceof Error ? err.message : err}`,
      );
      return this.emptyResult();
    }
  }

  private emptyResult(): SuggestionResult {
    return {
      accountCode: null,
      accountLabel: null,
      cohortCode: null,
      projectId: null,
      projectTitle: null,
      disciplineCode: null,
      confidencePerField: {},
      reasoning: null,
      budgetBlocked: false,
    };
  }

  private buildPrompt(
    label: string,
    amountCents: number | null,
    kind: 'INCOME' | 'EXPENSE' | 'IN_KIND' | null,
    accounts: Array<{ code: string; label: string; kind: string }>,
    cohorts: Array<{ code: string; label: string }>,
    projects: Array<{ id: string; title: string; summary: string | null }>,
  ): string {
    const amountLine = amountCents
      ? `Montant: ${(amountCents / 100).toFixed(2)} €`
      : 'Montant: non précisé';
    const kindLine = kind ? `Type: ${kind}` : 'Type: inconnu';

    const accountsList = accounts
      .map((a) => `  - ${a.code} (${a.kind}) — ${a.label}`)
      .join('\n');

    const cohortsList =
      cohorts.length > 0
        ? cohorts.map((c) => `  - ${c.code} — ${c.label}`).join('\n')
        : '  (aucune cohorte configurée)';

    const projectsList =
      projects.length > 0
        ? projects
            .map(
              (p) =>
                `  - ${p.id} — ${p.title}${p.summary ? ` (${p.summary.slice(0, 80)})` : ''}`,
            )
            .join('\n')
        : '  (aucun projet actif — retourne projectId=null)';

    return `Analyse cette saisie comptable et propose la catégorisation la plus pertinente.

Libellé: "${label}"
${amountLine}
${kindLine}

Comptes comptables disponibles:
${accountsList}

Cohortes analytiques:
${cohortsList}

Projets actifs du club:
${projectsList}

Retourne UN JSON STRICT:
{
  "accountCode": "code à 6 chiffres parmi la liste (ou null si aucun pertinent)",
  "cohortCode": "code cohorte parmi la liste (ou null si non applicable)",
  "projectId": "UUID d'un projet actif (ou null si dépense générale)",
  "disciplineCode": "slug minuscule ex 'karate', 'judo' (ou null)",
  "confidencePerField": {
    "accountCode": "0-1",
    "cohortCode": "0-1",
    "projectId": "0-1",
    "disciplineCode": "0-1"
  },
  "reasoning": "1 phrase courte expliquant le choix"
}

Règles strictes:
- JSON uniquement, pas de texte avant/après.
- accountCode DOIT être dans la liste fournie (ou null).
- projectId DOIT être un UUID de la liste (ou null).
- cohortCode DOIT être dans la liste (ou null).
- Pour une dépense générique sans cohorte évidente, cohortCode=null.
- Pour une dépense liée à un projet (matériel événement, achat spécifique), propose le projet le plus pertinent.`;
  }

  private parseJson(content: string): Record<string, unknown> | null {
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
