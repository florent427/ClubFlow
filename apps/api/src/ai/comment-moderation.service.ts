import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from './openrouter.service';

export type CommentCategory =
  | 'constructive'
  | 'off-topic'
  | 'offensive'
  | 'spam'
  | 'insulting'
  | 'other';

export type CommentDecision = 'APPROVE' | 'NEEDS_REVIEW' | 'REJECT' | 'SPAM';

export interface ModerationResult {
  decision: CommentDecision;
  score: number; // 0.0 (très négatif/toxique) → 1.0 (excellent)
  category: CommentCategory;
  reason: string;
}

export interface ModerateCommentInput {
  apiKey: string;
  textModel: string;
  commentBody: string;
  /** Contexte de l'article (titre + excerpt) pour évaluer la pertinence. */
  articleTitle?: string;
  articleExcerpt?: string;
}

const SYSTEM_PROMPT = `Tu es un modérateur de commentaires pour un blog de club sportif.
Ton rôle : évaluer chaque commentaire soumis par un visiteur et décider s'il
doit être publié automatiquement, validé manuellement ou rejeté.

Tu réponds UNIQUEMENT avec un objet JSON conforme à ce schéma :
{
  "decision": "APPROVE" | "NEEDS_REVIEW" | "REJECT" | "SPAM",
  "score": 0.0 à 1.0,
  "category": "constructive" | "off-topic" | "offensive" | "spam" | "insulting" | "other",
  "reason": "explication courte en français"
}

Règles de décision :

APPROVE (publication automatique) :
- Commentaire constructif, poli, pertinent par rapport à l'article
- Remerciement, encouragement, question sincère
- Témoignage personnel cohérent avec le sujet
- Critique factuelle mais respectueuse
→ score 0.7 à 1.0

NEEDS_REVIEW (validation manuelle requise) :
- Opinion tranchée qui pourrait mériter une réponse de l'admin
- Hors-sujet mais pas hostile
- Ton ambigu ou sarcastique
- Critique qui frise l'irrespect sans être insultante
- Contient un lien externe (à vérifier)
→ score 0.4 à 0.7

REJECT (refusé par la modération) :
- Insulte personnelle, propos haineux, discrimination
- Contenu choquant, vulgaire, violent
- Attaque ad hominem contre le club, ses membres
→ score 0.0 à 0.3

SPAM (spam/bots) :
- Publicité déguisée, promotion d'un site/produit tiers
- Texte incohérent, mot-clé stuffing SEO
- Multiples liens suspects
→ score 0.0 à 0.2

Sois BIENVEILLANT par défaut (doute → NEEDS_REVIEW, pas REJECT).`;

/**
 * Modère un commentaire via un LLM (via OpenRouter).
 * Retourne une décision structurée + score + catégorie + raison.
 */
@Injectable()
export class CommentModerationService {
  private readonly logger = new Logger(CommentModerationService.name);

  constructor(private readonly openrouter: OpenrouterService) {}

  async moderate(input: ModerateCommentInput): Promise<ModerationResult> {
    const userPrompt = `Article : "${input.articleTitle ?? '(inconnu)'}"
${input.articleExcerpt ? `Résumé : ${input.articleExcerpt.slice(0, 300)}` : ''}

Commentaire à modérer :
"""
${input.commentBody.trim().slice(0, 2000)}
"""

Réponds UNIQUEMENT avec le JSON demandé, sans markdown.`;

    try {
      const res = await this.openrouter.chatCompletion({
        apiKey: input.apiKey,
        model: input.textModel,
        temperature: 0.2, // déterministe pour la modération
        maxTokens: 500,
        responseFormat: 'json_object',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const parsed = parseJsonLoose<Partial<ModerationResult>>(res.content);
      return this.normalize(parsed);
    } catch (err) {
      this.logger.warn(
        `Modération IA échouée : ${err instanceof Error ? err.message : String(err)}. Fallback NEEDS_REVIEW.`,
      );
      // Fallback safe : en cas d'échec IA, on flag pour review manuelle
      // plutôt que de publier automatiquement (sécurité par défaut).
      return {
        decision: 'NEEDS_REVIEW',
        score: 0.5,
        category: 'other',
        reason:
          'Modération IA indisponible — validation manuelle requise par prudence.',
      };
    }
  }

  private normalize(raw: Partial<ModerationResult>): ModerationResult {
    const validDecisions: CommentDecision[] = [
      'APPROVE',
      'NEEDS_REVIEW',
      'REJECT',
      'SPAM',
    ];
    const validCategories: CommentCategory[] = [
      'constructive',
      'off-topic',
      'offensive',
      'spam',
      'insulting',
      'other',
    ];
    const decision = validDecisions.includes(raw.decision as CommentDecision)
      ? (raw.decision as CommentDecision)
      : 'NEEDS_REVIEW';
    const category = validCategories.includes(raw.category as CommentCategory)
      ? (raw.category as CommentCategory)
      : 'other';
    const score =
      typeof raw.score === 'number' ? Math.max(0, Math.min(1, raw.score)) : 0.5;
    const reason = String(raw.reason ?? 'Pas de raison fournie').slice(0, 500);
    return { decision, score, category, reason };
  }
}

/**
 * Parse tolérant de JSON LLM (réutilise le pattern d'article-generator).
 */
function parseJsonLoose<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* continue */
  }
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
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate) as T;
  }
  throw new Error('Impossible de parser la réponse comme JSON.');
}
