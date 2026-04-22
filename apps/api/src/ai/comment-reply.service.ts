import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from './openrouter.service';

export interface GenerateReplyInput {
  apiKey: string;
  textModel: string;
  /** Texte du commentaire de l'utilisateur. */
  commentBody: string;
  /** Nom de l'auteur du commentaire (pour personnaliser). */
  commentAuthorName: string;
  /** Contexte de l'article (titre + excerpt + keywords SEO). */
  articleTitle: string;
  articleExcerpt?: string | null;
  articleKeywords?: string[];
  /** Nom du club (pour signer la réponse). */
  clubName: string;
  /** Nom à utiliser pour signer (ex. "L'équipe SKSR", "Sensei Tanaka"). Par défaut clubName. */
  replyAuthorName?: string;
}

const SYSTEM_PROMPT = `Tu es un community manager expert en communication sportive ET en SEO.
Ton rôle : rédiger des réponses authentiques aux commentaires de visiteurs
sur le blog d'un club sportif.

Objectifs de chaque réponse :
1. REMERCIER sincèrement l'auteur par son prénom (jamais formel, toujours chaleureux)
2. APPORTER DE LA VALEUR en enrichissant le sujet de l'article :
   - Informations complémentaires factuelles
   - Contexte historique, technique ou pratique
   - Liens sémantiques vers les mots-clés SEO de l'article (naturellement)
3. ENCOURAGER l'échange : question ouverte, invitation à revenir
4. ÉVITER les clichés "merci pour votre commentaire 🙏" creux

Règles SEO :
- Longueur : 60-150 mots (concis mais substantiel)
- Intègre 1-2 mots-clés de l'article naturellement dans le texte
- Si pertinent, mentionne un autre aspect de l'article que le commentaire ne couvre pas
- Style conversationnel, pas robotique — un humain doit vraiment croire que c'est lui qui a écrit

Ton :
- Bienveillant, expert, passionné
- Première personne plurielle "nous" (sauf si replyAuthorName = une personne précise)
- Pas d'emojis à l'excès (1 max, optionnel)
- Pas de formule finale signée (ex. "Cordialement,...") — la signature est automatique

Tu réponds UNIQUEMENT avec le texte de la réponse, sans préambule ni markdown autour.`;

/**
 * Génère une réponse d'admin à un commentaire de visiteur via IA.
 *
 * La réponse est toujours bienveillante, valorisante pour l'article et
 * enrichie SEO (utilise les keywords de l'article). L'admin la relit
 * avant publication (peut l'éditer).
 */
@Injectable()
export class CommentReplyService {
  private readonly logger = new Logger(CommentReplyService.name);

  constructor(private readonly openrouter: OpenrouterService) {}

  async generate(input: GenerateReplyInput): Promise<string> {
    if (!input.commentBody?.trim()) {
      throw new BadRequestException('Commentaire vide');
    }

    const userPrompt = `Article : "${input.articleTitle}"
${input.articleExcerpt ? `Résumé article : ${input.articleExcerpt.slice(0, 400)}` : ''}
${
  input.articleKeywords && input.articleKeywords.length > 0
    ? `Mots-clés SEO à intégrer naturellement si pertinent : ${input.articleKeywords.slice(0, 8).join(', ')}`
    : ''
}

Commentaire de ${input.commentAuthorName} :
"""
${input.commentBody.trim().slice(0, 2000)}
"""

Tu vas répondre au nom de : ${input.replyAuthorName ?? `L'équipe ${input.clubName}`}

Rédige une réponse personnalisée, chaleureuse, qui remercie ${input.commentAuthorName} et apporte de la valeur SEO à l'article. Réponds UNIQUEMENT avec le texte de la réponse.`;

    try {
      const res = await this.openrouter.chatCompletion({
        apiKey: input.apiKey,
        model: input.textModel,
        temperature: 0.7, // un peu de créativité
        maxTokens: 500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
      return cleanupReply(res.content);
    } catch (err) {
      this.logger.error(
        `Génération réponse IA échouée : ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        `Impossible de générer la réponse : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Nettoie la réponse IA : retire éventuels blocs markdown, guillemets
 * d'ouverture/fermeture, espaces extras, signatures auto-générées.
 */
function cleanupReply(raw: string): string {
  let text = raw.trim();
  // Retire un éventuel bloc code fence
  const fence = text.match(/^```(?:[a-z]+)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence && fence[1]) text = fence[1].trim();
  // Retire guillemets qui englobent tout le texte
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('«') && text.endsWith('»'))
  ) {
    text = text.slice(1, -1).trim();
  }
  // Retire signature finale (ex. "— L'équipe", "Cordialement,")
  text = text.replace(/\n+(--|—|Cordialement|Sincèrement|Bien à vous)[\s\S]*$/i, '');
  return text.trim();
}
