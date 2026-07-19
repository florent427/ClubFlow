import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OpenrouterService } from './openrouter.service';

/**
 * Réécrit le descriptif brut d'un catalogue fournisseur en une description
 * de boutique de club, au ton sobre attendu par une association sportive.
 *
 * Calqué sur `ArticleGeneratorService` : le service est **pur** (il reçoit
 * la clé API et le modèle, il ne lit ni les réglages ni le budget). Le
 * resolver reste le point de composition qui vérifie le budget AVANT
 * l'appel et enregistre la consommation APRÈS.
 *
 * Différence assumée avec le générateur d'articles : la sortie est du
 * **texte brut**, pas du JSON. Il n'y a qu'un seul champ à produire ;
 * imposer une enveloppe JSON n'apporterait aucune structure et ajouterait
 * une classe entière de pannes (modèle qui répond hors format) pour rien.
 */

const SYSTEM_PROMPT = `Tu rédiges les fiches produit de la boutique en ligne d'un club de sport amateur français (association loi 1901).

Ton lecteur est un membre du club — un parent, un licencié — pas un client d'une marque. Il veut savoir ce qu'il achète, pas être séduit.

Règles STRICTES :
- Langue : français.
- Longueur : 2 à 4 phrases, 40 à 80 mots au total. Jamais plus.
- Contenu : uniquement des faits présents dans le texte fournisseur (matière, coupe, tailles, entretien, composition, usage). Tu peux reformuler et réorganiser, jamais inventer.
- Si le texte fournisseur ne mentionne pas une caractéristique, ne l'invente pas — même plausible. Pas de chiffre, pas de norme, pas de garantie sortis de nulle part.
- INTERDIT : superlatifs et vocabulaire publicitaire ("révolutionnaire", "incontournable", "exceptionnel", "ultime", "premium", "révolutionnez", "sublimez", "n'attendez plus"), promesses de performance, appels à l'action, points d'exclamation, emojis.
- INTERDIT : le nom d'une marque concurrente ou d'un revendeur présent dans le texte source.
- Style : phrases courtes, voix active, présent de l'indicatif. Concret et descriptif.
- Pas de titre, pas de puces, pas de markdown, pas de guillemets autour du texte.

Tu réponds UNIQUEMENT par la description elle-même. Aucun préambule, aucun commentaire, aucune alternative proposée.`;

export interface GenerateShopDescriptionInput {
  apiKey: string;
  textModel: string;
  /** Modèle de repli si le principal échoue. Null = pas de repli. */
  textFallbackModel?: string | null;
  /** Nom du produit tel que saisi par l'admin. */
  productName: string;
  /** Descriptif brut collé depuis le catalogue fournisseur. */
  supplierText: string;
}

export interface GenerateShopDescriptionResult {
  description: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    costCents?: number;
  };
}

/**
 * Nettoie la sortie du modèle : certains modèles encadrent la réponse de
 * guillemets, la préfixent ("Voici la description :") ou l'enveloppent dans
 * un bloc markdown malgré la consigne.
 */
function nettoyerSortie(raw: string): string {
  let texte = raw.trim();

  // Bloc de code markdown ```…``` éventuel.
  const fence = texte.match(/```(?:\w+)?\s*\n?([\s\S]*?)\n?```/);
  if (fence?.[1]) texte = fence[1].trim();

  // Préambule type "Voici la description :" / "Description :" sur la 1re ligne.
  texte = texte.replace(
    /^\s*(voici\s+(la\s+)?description[^:\n]*|description(\s+du\s+produit)?)\s*:\s*/i,
    '',
  );

  // Guillemets encadrants (droits ou français).
  texte = texte.replace(/^["'«»“”]\s*/, '');
  texte = texte.replace(/\s*["'«»“”]$/, '');

  // Puces markdown en début de ligne : on veut de la prose.
  texte = texte.replace(/^\s*[-*•]\s+/gm, '');

  return texte.trim();
}

@Injectable()
export class ShopDescriptionGeneratorService {
  private readonly logger = new Logger(ShopDescriptionGeneratorService.name);

  constructor(private readonly openrouter: OpenrouterService) {}

  async generate(
    input: GenerateShopDescriptionInput,
  ): Promise<GenerateShopDescriptionResult> {
    const nom = input.productName.trim();
    const source = input.supplierText.trim();

    if (nom.length < 2) {
      throw new BadRequestException(
        'Le nom du produit doit faire au moins 2 caractères.',
      );
    }
    if (source.length < 20) {
      throw new BadRequestException(
        'Le texte fournisseur doit faire au moins 20 caractères.',
      );
    }

    const userPrompt = `Produit vendu par le club : ${nom}

Descriptif brut du catalogue fournisseur (à réécrire) :
---
${source.slice(0, 6000)}
---

Réécris ce descriptif pour la boutique du club, en respectant toutes les règles.
Réponds uniquement par la description, rien d'autre.`;

    // Modèle principal puis repli — un modèle indisponible ou surchargé ne
    // doit pas coûter sa saisie à l'admin.
    const modeles = [input.textModel];
    if (input.textFallbackModel && input.textFallbackModel !== input.textModel) {
      modeles.push(input.textFallbackModel);
    }

    let derniereErreur: string | null = null;

    for (const modele of modeles) {
      try {
        const res = await this.openrouter.chatCompletion({
          apiKey: input.apiKey,
          model: modele,
          // Basse température : on reformule un texte factuel, on ne crée
          // pas. Plus c'est déterministe, moins le modèle brode.
          temperature: 0.3,
          // ~80 mots demandés ; 700 tokens laissent de la marge sans payer
          // pour une dissertation si le modèle ignore la consigne.
          maxTokens: 700,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        });

        const description = nettoyerSortie(res.content);
        if (description.length < 20) {
          derniereErreur = `réponse trop courte (${description.length} caractères)`;
          this.logger.warn(
            `Modèle ${modele} — ${derniereErreur}, on tente le repli si disponible.`,
          );
          continue;
        }

        return {
          description,
          usage: {
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            model: res.model,
            costCents: res.costCents,
          },
        };
      } catch (err) {
        derniereErreur = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Modèle ${modele} — échec : ${derniereErreur}`);
      }
    }

    throw new BadRequestException(
      `La génération a échoué sur ${modeles.join(', ')} : ${
        derniereErreur ?? 'raison inconnue'
      }. Réessayez, ou changez de modèle dans Paramètres → IA.`,
    );
  }
}
