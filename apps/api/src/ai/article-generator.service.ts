import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from './openrouter.service';

/**
 * Génère un article complet optimisé SEO 2026 depuis un texte source.
 * Retourne un draft structuré avec title/slug/meta/h1/sections/FAQ/keywords
 * et des prompts d'images (featured + inline) prêts à être envoyés au
 * ImageGeneratorService.
 */

export interface ArticleDraftSection {
  h2: string;
  paragraphs: string[];
  /** Prompt pour générer une image inline. Null = pas d'image dans cette section. */
  inlineImagePrompt: string | null;
  /** Alt text de l'image inline (si prompt présent). */
  inlineImageAlt: string | null;
}

export interface ArticleDraft {
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
  h1: string;
  sections: ArticleDraftSection[];
  faq: Array<{ question: string; answer: string }>;
  keywords: string[];
  featuredImagePrompt: string;
  featuredImageAlt: string;
}

const SYSTEM_PROMPT = `Tu es un rédacteur SEO expert en 2026, spécialisé dans les articles de blog optimisés pour les moteurs de recherche modernes (Google SGE, Bing Copilot, Perplexity, AI Overviews).

Règles SEO 2026 à RESPECTER STRICTEMENT :
- seoTitle : 50-60 caractères, contient le mot-clé principal en début
- seoDescription : 150-160 caractères, engageante, avec CTA implicite
- h1 : unique, ≤ 70 caractères, contient le mot-clé principal
- sections : 4-6 H2 hiérarchisés, chaque H2 ≤ 65 caractères
- paragraphs : 40-80 mots chacun, phrases courtes (≤ 20 mots), lisibles en scan
- Mots-clés : LSI sémantiques (synonymes, variantes, concepts liés) — JAMAIS de keyword stuffing
- E-E-A-T : ton expert, factuel, pédagogique, avec exemples concrets si pertinents
- Featured snippet : la première section répond directement et factuellement à la question principale
- FAQ : 3-5 questions conversationnelles (si pertinent pour le sujet), réponses 20-50 mots
- alt text : descriptif complet pour les images, pas juste des mots-clés
- slug : court, en kebab-case, contient le mot-clé principal, sans stop words
- excerpt : 150-200 caractères, accrocheur, partageable sur réseaux sociaux
- Ton : ${'informatif, clair, expert'}
- Langue : français
- Pas de contenu sponsorisé déguisé, pas de claims non vérifiés

Tu DOIS répondre avec un JSON STRICTEMENT conforme à ce schéma (et rien d'autre — pas de markdown autour) :

{
  "title": "Titre humain de l'article",
  "slug": "slug-kebab-case",
  "seoTitle": "Title tag optimisé",
  "seoDescription": "Meta description 150-160 chars",
  "excerpt": "Chapô partageable 150-200 chars",
  "h1": "Titre H1 (peut être identique ou distinct du title)",
  "sections": [
    {
      "h2": "Sous-titre H2",
      "paragraphs": ["Paragraphe 1", "Paragraphe 2"],
      "inlineImagePrompt": "Description d'image en anglais pour IA (ou null)",
      "inlineImageAlt": "Alt text en français (ou null)"
    }
  ],
  "faq": [
    { "question": "Question conversationnelle ?", "answer": "Réponse concise 20-50 mots" }
  ],
  "keywords": ["mot-clé principal", "mot-clé LSI 1", "mot-clé LSI 2"],
  "featuredImagePrompt": "Description d'image en anglais pour l'image mise en avant",
  "featuredImageAlt": "Alt text français pour l'image mise en avant"
}`;

export interface GenerateArticleInput {
  apiKey: string;
  textModel: string;
  sourceText: string;
  tone?: string;
  /** Nombre de sections qui doivent contenir une image inline (0 à 6). */
  inlineImageSlots: number;
  /** Active le plugin web d'OpenRouter (accès Internet pour chiffres/événements récents). */
  useWebSearch?: boolean;
}

export interface GenerateArticleResult {
  draft: ArticleDraft;
  usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    costCents?: number;
  };
}

/**
 * Parse tolérant de JSON LLM : certains modèles (GLM, Minimax, Mistral...)
 * ignorent `response_format: json_object` et renvoient :
 *   - du texte avec un bloc ```json ... ``` autour
 *   - du texte avec un préambule type "Voici le JSON : {...}"
 *   - du JSON nu parfois mal échappé
 *
 * On tente dans l'ordre :
 *   1. JSON.parse brut
 *   2. Extraction d'un bloc ```json``` ou ``` ```
 *   3. Recherche du 1er { et dernier } équilibré
 */
function parseJsonLoose<T>(raw: string): T {
  // 1. Essai brut
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* continue */
  }

  // 2. Bloc markdown code fence ```json ... ``` (ou ``` ... ```)
  const fenceMatch =
    trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i) ??
    trimmed.match(/```\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      /* continue */
    }
  }

  // 3. Fallback : premier { et dernier } équilibré
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* tombe dans le throw */
    }
  }

  throw new Error('Impossible de parser la réponse comme JSON.');
}

@Injectable()
export class ArticleGeneratorService {
  private readonly logger = new Logger(ArticleGeneratorService.name);

  constructor(private readonly openrouter: OpenrouterService) {}

  async generate(input: GenerateArticleInput): Promise<GenerateArticleResult> {
    if (!input.sourceText || input.sourceText.trim().length < 20) {
      throw new BadRequestException(
        'Le texte source doit faire au moins 20 caractères.',
      );
    }
    const inlineImageCount = Math.max(0, Math.min(6, input.inlineImageSlots));

    const webSearchHint = input.useWebSearch
      ? `
RECHERCHE WEB ACTIVÉE : tu as accès à Internet via un outil de recherche.
Utilise-le OBLIGATOIREMENT pour :
- Vérifier les chiffres, dates, statistiques cités
- Récupérer l'actualité récente pertinente (dernière saison, derniers événements)
- Confirmer règlements / normes / pratiques à jour
Intègre les informations trouvées naturellement dans le corps (pas de liens externes
dans le JSON — seulement du texte enrichi et factuel).
`
      : '';

    const userPrompt = `Génère un article SEO optimisé à partir de ce texte source :

---
${input.sourceText.trim().slice(0, 8000)}
---
${webSearchHint}
Contraintes supplémentaires :
- Tonalité : ${input.tone ?? 'informatif, clair, expert'}
- ${inlineImageCount} sections doivent avoir inlineImagePrompt non-null (choisir les plus illustratives)
- Les autres sections : inlineImagePrompt = null et inlineImageAlt = null
- faq : 3-5 questions si le sujet s'y prête (ex. tutoriel, guide, comparatif), sinon tableau vide
- featuredImagePrompt : évocateur, esthétique, en anglais pour le modèle image

IMPORTANT : réponds UNIQUEMENT avec l'objet JSON demandé.
- Pas de markdown, pas de \`\`\`json\`\`\`, pas de texte avant ou après.
- Commence directement par { et termine par }.
- Tous les strings doivent être valides JSON (échappe les guillemets avec \\", les retours à la ligne avec \\n).`;

    // Premier essai : avec response_format json_object (certains modèles
    // le supportent nativement et c'est plus fiable).
    let res = await this.openrouter.chatCompletion({
      apiKey: input.apiKey,
      model: input.textModel,
      temperature: 0.7,
      maxTokens: 6000,
      responseFormat: 'json_object',
      webSearch: input.useWebSearch === true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    let draft: ArticleDraft;
    try {
      draft = parseJsonLoose<ArticleDraft>(res.content);
    } catch (err1) {
      // Retry sans response_format ET sans web search : le plugin web
      // injecte beaucoup de contexte (résultats Exa) qui perturbe les
      // modèles moyens (GLM, Minimax) et leur fait oublier le format JSON.
      // Au retry on privilégie la structure JSON sur la richesse web.
      this.logger.warn(
        `Modèle ${input.textModel} — 1er essai non-JSON, retry SANS response_format ET SANS web search (${
          err1 instanceof Error ? err1.message : String(err1)
        })`,
      );
      try {
        res = await this.openrouter.chatCompletion({
          apiKey: input.apiKey,
          model: input.textModel,
          temperature: 0.3, // plus déterministe au retry
          maxTokens: 6000,
          webSearch: false, // désactivé pour donner priorité au format JSON
          // pas de responseFormat ici
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });
        draft = parseJsonLoose<ArticleDraft>(res.content);
      } catch (err2) {
        this.logger.error(
          `Réponse non-JSON même après retry (model=${input.textModel}) : ${res.content.slice(0, 500)}`,
          err2 instanceof Error ? err2.stack : undefined,
        );
        const webSearchHint = input.useWebSearch
          ? ' La recherche web était activée — certains modèles (GLM, Minimax) gèrent mal le combo web search + JSON strict. Essayez sans recherche web, ou bascule sur un modèle plus capable.'
          : '';
        throw new BadRequestException(
          `Le modèle "${input.textModel}" n'a pas retourné un JSON valide (même après retry sans web search).` +
            webSearchHint +
            ' Essayez un autre modèle (ex. openai/gpt-4o-mini, anthropic/claude-haiku-4.5, x-ai/grok-4-fast) ou simplifiez le texte source.',
        );
      }
    }

    // Validation minimale
    if (
      !draft.title ||
      !draft.h1 ||
      !Array.isArray(draft.sections) ||
      draft.sections.length === 0
    ) {
      throw new BadRequestException(
        'Draft IA incomplet (title/h1/sections manquants).',
      );
    }
    // Normalisation : slug, featured image defaults
    draft.slug = (draft.slug || draft.title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    draft.faq = Array.isArray(draft.faq) ? draft.faq : [];
    draft.keywords = Array.isArray(draft.keywords) ? draft.keywords : [];
    draft.excerpt = draft.excerpt ?? '';
    draft.featuredImageAlt = draft.featuredImageAlt ?? draft.title;
    draft.featuredImagePrompt = draft.featuredImagePrompt ?? draft.title;
    draft.sections = draft.sections.map((s) => ({
      h2: s.h2 ?? '',
      paragraphs: Array.isArray(s.paragraphs) ? s.paragraphs : [],
      inlineImagePrompt: s.inlineImagePrompt ?? null,
      inlineImageAlt: s.inlineImageAlt ?? null,
    }));

    return {
      draft,
      usage: {
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        model: res.model,
        costCents: res.costCents,
      },
    };
  }
}
