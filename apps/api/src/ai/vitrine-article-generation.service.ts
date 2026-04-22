import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VitrineContentService } from '../vitrine/vitrine-content.service';
import { AiSettingsService } from './ai-settings.service';
import {
  ArticleGeneratorService,
  type ArticleDraft,
} from './article-generator.service';
import { ImageGeneratorService } from './image-generator.service';

export interface StartGenerationInput {
  clubId: string;
  userId: string;
  sourceText: string;
  tone?: string;
  generateFeaturedImage?: boolean;
  inlineImageCount?: number;
  useAiImages?: boolean;
  useWebSearch?: boolean;
}

/**
 * Orchestration de la génération asynchrone d'un article vitrine.
 *
 * Flow :
 *   1. `start(...)` crée un `VitrineArticle` en DRAFT avec
 *      `generationStatus=PENDING` et retourne l'ID immédiatement.
 *   2. Un `Promise` fire-and-forget lance la pipeline (texte + images).
 *   3. Au fur et à mesure, `generationProgress` est mis à jour en DB
 *      (le frontend peut poll via la query article).
 *   4. À la fin : `generationStatus=DONE` (ou FAILED si exception).
 *   5. Les erreurs non-bloquantes (image gen qui échoue alors qu'on avait
 *      demandé l'IA) vont dans `generationWarnings[]` et on fallback sur
 *      placeholder SVG côté frontend.
 */
@Injectable()
export class VitrineArticleGenerationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VitrineArticleGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: VitrineContentService,
    private readonly settings: AiSettingsService,
    private readonly articleGen: ArticleGeneratorService,
    private readonly imageGen: ImageGeneratorService,
  ) {}

  /**
   * Au démarrage : marque comme FAILED tous les articles PENDING plus
   * vieux que 10 minutes. Cela évite les "zombies" quand le serveur
   * redémarre (watch mode en dev, crash, déploiement) pendant qu'une
   * génération fire-and-forget tournait : la promise est morte mais
   * la DB reste en PENDING pour toujours.
   *
   * Le seuil de 10 min donne assez de temps pour une vraie génération
   * en cours (qui peut prendre 1-3 min) tout en récupérant rapidement
   * les cas anormaux.
   */
  async onApplicationBootstrap(): Promise<void> {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const stuck = await this.prisma.vitrineArticle.updateMany({
      where: {
        generationStatus: 'PENDING',
        OR: [
          { generationStartedAt: { lt: cutoff } },
          { generationStartedAt: null },
        ],
      },
      data: {
        generationStatus: 'FAILED',
        generationProgress: null,
        generationError:
          'Le serveur a redémarré pendant la génération. Relance via "Génération IA" depuis la liste des articles.',
        generationEndedAt: new Date(),
      },
    });
    if (stuck.count > 0) {
      this.logger.warn(
        `Cleanup démarrage : ${stuck.count} article(s) PENDING zombie(s) → FAILED.`,
      );
    }
  }

  /**
   * Crée un article PENDING et lance la génération en arrière-plan.
   * Retourne l'ID de l'article immédiatement.
   */
  async start(input: StartGenerationInput): Promise<string> {
    const { clubId, userId } = input;

    // 1. Créer l'article en DRAFT + PENDING avec un placeholder visible
    const placeholder = {
      format: 'html' as const,
      html:
        '<p>⏳ Génération en cours, cela peut prendre 30 à 90 secondes. ' +
        'Tu peux fermer cet article et revenir plus tard — il sera mis à jour ' +
        'automatiquement dans la liste.</p>',
    };
    const article = await this.content.createArticle(clubId, userId, {
      title: '⏳ Génération IA en cours…',
      bodyJson: placeholder as unknown as Prisma.InputJsonValue,
      publishNow: false,
    });

    await this.prisma.vitrineArticle.update({
      where: { id: article.id },
      data: {
        generationStatus: 'PENDING',
        generationProgress: 'Génération du texte…',
        generationStartedAt: new Date(),
      },
    });

    // 2. Fire-and-forget : la pipeline tourne sans bloquer la mutation
    this.runPipeline(article.id, input).catch((err) => {
      this.logger.error(
        `Pipeline génération article ${article.id} crashée`,
        err instanceof Error ? err.stack : String(err),
      );
    });

    return article.id;
  }

  /** Pipeline complète : texte → images → update article → DONE/FAILED. */
  private async runPipeline(
    articleId: string,
    input: StartGenerationInput,
  ): Promise<void> {
    const { clubId, userId } = input;
    const warnings: string[] = [];

    try {
      // 1. Récupère la config IA du club
      const apiKey = await this.settings.getDecryptedApiKey(clubId);
      const { textModel, textFallbackModel, imageModel } =
        await this.settings.getModels(clubId);

      // 2. Génère le texte. Si le modèle primaire échoue (JSON invalide
      //    après retry) et qu'un fallback est configuré, on retente avec
      //    le fallback. Warning conservé pour affichage éditeur.
      if (input.useWebSearch) {
        await this.setProgress(
          articleId,
          'Recherche web + génération du texte…',
        );
      }
      let draft: Awaited<ReturnType<typeof this.articleGen.generate>>['draft'];
      let textUsage: Awaited<
        ReturnType<typeof this.articleGen.generate>
      >['usage'];
      try {
        const res = await this.articleGen.generate({
          apiKey,
          textModel,
          sourceText: input.sourceText,
          tone: input.tone,
          inlineImageSlots: input.inlineImageCount ?? 3,
          useWebSearch: input.useWebSearch === true,
        });
        draft = res.draft;
        textUsage = res.usage;
      } catch (err) {
        if (!textFallbackModel) throw err; // pas de fallback → remonte
        const primaryMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Article ${articleId} : modèle primaire ${textModel} a échoué (${primaryMsg}). Retry sur fallback ${textFallbackModel}.`,
        );
        warnings.push(
          `Modèle primaire (${textModel}) a échoué sur la génération de texte — bascule automatique sur ${textFallbackModel}.`,
        );
        await this.setProgress(
          articleId,
          `Bascule sur modèle de fallback (${textFallbackModel})…`,
        );
        const res = await this.articleGen.generate({
          apiKey,
          textModel: textFallbackModel,
          sourceText: input.sourceText,
          tone: input.tone,
          inlineImageSlots: input.inlineImageCount ?? 3,
          useWebSearch: input.useWebSearch === true,
        });
        draft = res.draft;
        textUsage = res.usage;
      }

      await this.settings.logUsage({
        clubId,
        userId,
        feature: 'ARTICLE_GENERATION',
        model: textUsage.model,
        inputTokens: textUsage.inputTokens,
        outputTokens: textUsage.outputTokens,
        imagesGenerated: 0,
        costCents: textUsage.costCents,
      });

      const useAiImages = input.useAiImages !== false;
      const wantFeatured = input.generateFeaturedImage !== false;

      // 3. Image mise en avant (si IA + demandée)
      let featuredImageAssetId: string | null = null;
      if (useAiImages && wantFeatured && draft.featuredImagePrompt) {
        await this.setProgress(articleId, "Génération de l'image mise en avant…");
        try {
          const featured = await this.imageGen.generateAndUpload({
            clubId,
            userId,
            apiKey,
            imageModel,
            prompt: draft.featuredImagePrompt,
            ownerKind: 'VITRINE_ARTICLE',
            ownerId: articleId,
          });
          featuredImageAssetId = featured.mediaAssetId;
          await this.settings.logUsage({
            clubId,
            userId,
            feature: 'IMAGE_GENERATION',
            model: featured.model,
            inputTokens: featured.inputTokens,
            outputTokens: featured.outputTokens,
            imagesGenerated: 1,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(
            `Image mise en avant non générée : ${msg}. Un placeholder a été inséré (tu peux uploader ta propre photo).`,
          );
          this.logger.warn(
            `[AI gen] featured image failed for article ${articleId}: ${msg}`,
          );
        }
      }

      // 4. Images inline (si IA + au moins une section a un prompt)
      const sectionsWithUrl: Array<{
        h2: string;
        paragraphs: string[];
        inlineImagePrompt: string | null;
        inlineImageAlt: string | null;
        inlineImageUrl: string | null;
      }> = [];
      const promptSections = draft.sections.filter((s) => s.inlineImagePrompt);
      const totalInline = promptSections.length;
      let currentInline = 0;

      for (const section of draft.sections) {
        let url: string | null = null;
        if (useAiImages && section.inlineImagePrompt) {
          currentInline += 1;
          await this.setProgress(
            articleId,
            `Génération image inline ${currentInline}/${totalInline}…`,
          );
          try {
            const inline = await this.imageGen.generateAndUpload({
              clubId,
              userId,
              apiKey,
              imageModel,
              prompt: section.inlineImagePrompt,
              ownerKind: 'VITRINE_ARTICLE',
              ownerId: articleId,
            });
            url = inline.publicUrl;
            await this.settings.logUsage({
              clubId,
              userId,
              feature: 'IMAGE_GENERATION',
              model: inline.model,
              inputTokens: inline.inputTokens,
              outputTokens: inline.outputTokens,
              imagesGenerated: 1,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            warnings.push(
              `Image inline "${section.h2}" non générée : ${msg}. Un placeholder a été inséré.`,
            );
            this.logger.warn(
              `[AI gen] inline image "${section.h2}" failed: ${msg}`,
            );
          }
        }
        sectionsWithUrl.push({
          h2: section.h2,
          paragraphs: section.paragraphs,
          inlineImagePrompt: section.inlineImagePrompt,
          inlineImageAlt: section.inlineImageAlt,
          inlineImageUrl: url,
        });
      }

      // 5. Construire l'HTML final (placeholders SVG si URL manquante)
      await this.setProgress(articleId, 'Finalisation…');
      const html = this.buildHtml({
        draft,
        sections: sectionsWithUrl,
      });

      // 6. Mise à jour de l'article avec le contenu complet + SEO
      await this.content.updateArticle(clubId, articleId, {
        title: draft.title,
        slug: draft.slug,
        excerpt: draft.excerpt || null,
        bodyJson: {
          format: 'html',
          html,
        } as unknown as Prisma.InputJsonValue,
        coverImageId: featuredImageAssetId,
        coverImageAlt: draft.featuredImageAlt ?? null,
        seoTitle: draft.seoTitle || null,
        seoDescription: draft.seoDescription || null,
        seoKeywords: draft.keywords ?? [],
        seoH1: draft.h1 || null,
        seoFaq:
          draft.faq.length > 0
            ? (draft.faq as unknown as Prisma.InputJsonValue)
            : null,
        seoOgImageId: featuredImageAssetId,
      });

      // 7. Marque DONE + warnings
      await this.prisma.vitrineArticle.update({
        where: { id: articleId },
        data: {
          generationStatus: 'DONE',
          generationProgress: null,
          generationError: null,
          generationWarnings: warnings,
          generationEndedAt: new Date(),
        },
      });

      this.logger.log(
        `Article ${articleId} généré avec succès (${warnings.length} warnings).`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Article ${articleId} : échec pipeline : ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.prisma.vitrineArticle.update({
        where: { id: articleId },
        data: {
          generationStatus: 'FAILED',
          generationProgress: null,
          generationError: msg.slice(0, 1000),
          generationWarnings: warnings,
          generationEndedAt: new Date(),
        },
      });
    }
  }

  private async setProgress(articleId: string, label: string): Promise<void> {
    await this.prisma.vitrineArticle.update({
      where: { id: articleId },
      data: { generationProgress: label },
    });
  }

  /**
   * Assemble l'HTML final à partir du draft texte + des URLs d'images
   * éventuellement manquantes (→ placeholders SVG).
   *
   * Important : la FAQ n'est PAS injectée dans le bodyHTML — elle est
   * stockée dans `seoFaqJson` et rendue côté public via la section
   * dédiée `.article-faq` (+ JSON-LD FAQPage). Éviter d'insérer la FAQ
   * aussi dans le corps sinon rendu dupliqué.
   */
  private buildHtml(args: {
    draft: ArticleDraft;
    sections: Array<{
      h2: string;
      paragraphs: string[];
      inlineImagePrompt: string | null;
      inlineImageAlt: string | null;
      inlineImageUrl: string | null;
    }>;
  }): string {
    const parts: string[] = [];
    if (args.draft.h1 && args.draft.h1 !== args.draft.title) {
      parts.push(`<h1>${escapeHtml(args.draft.h1)}</h1>`);
    }
    for (const section of args.sections) {
      if (section.h2) parts.push(`<h2>${escapeHtml(section.h2)}</h2>`);
      for (const p of section.paragraphs) {
        parts.push(`<p>${escapeHtml(p)}</p>`);
      }
      const alt = section.inlineImageAlt ?? section.inlineImagePrompt ?? '';
      if (section.inlineImageUrl) {
        parts.push(
          `<figure class="tiptap-img-figure" data-align="center"><img src="${escapeAttr(section.inlineImageUrl)}" alt="${escapeHtml(alt)}" /></figure>`,
        );
      } else if (section.inlineImagePrompt) {
        const ph = makePlaceholderSvgDataUrl(section.inlineImagePrompt);
        parts.push(
          `<figure class="tiptap-img-figure" data-align="center"><img src="${escapeAttr(ph)}" alt="${escapeHtml(alt)}" /></figure>`,
        );
      }
    }
    // NOTE : pas de FAQ ici — elle vit dans `seoFaqJson` et est rendue
    // séparément par la section `.article-faq` côté public.
    return parts.join('\n') || '<p></p>';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

/**
 * Placeholder SVG data URL — identique à celui du frontend pour cohérence.
 * Utilisé quand la génération IA d'une image inline a échoué.
 */
function makePlaceholderSvgDataUrl(prompt: string): string {
  const truncated = prompt.length > 120 ? prompt.slice(0, 117) + '…' : prompt;
  const escaped = truncated
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const words = escaped.split(/\s+/);
  const lines: string[] = [];
  let buf = '';
  for (const w of words) {
    if ((buf + ' ' + w).trim().length > 50) {
      if (buf) lines.push(buf.trim());
      buf = w;
    } else {
      buf = (buf + ' ' + w).trim();
    }
    if (lines.length >= 3) break;
  }
  if (buf && lines.length < 3) lines.push(buf);
  const tspans = lines
    .map(
      (l, i) => `<tspan x="600" dy="${i === 0 ? '0' : '28'}">${l}</tspan>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" preserveAspectRatio="xMidYMid slice"><rect width="1200" height="675" fill="#f1f5f9"/><rect x="0" y="0" width="1200" height="675" fill="url(#p)"/><defs><pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#f1f5f9"/><path d="M 0 0 L 40 40 M 40 0 L 0 40" stroke="#e2e8f0" stroke-width="1"/></pattern></defs><rect x="200" y="210" width="800" height="255" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="12"/><g transform="translate(600, 290)" fill="#64748b" text-anchor="middle" font-family="-apple-system, Segoe UI, Roboto, sans-serif"><text font-size="22" font-weight="700" letter-spacing="0.5" y="0">IMAGE A REMPLACER</text><text font-size="14" font-weight="400" y="28" fill="#94a3b8">Cliquez sur l'image puis sur l'icone X</text><g transform="translate(0, 70)" font-size="16" fill="#475569">${tspans}</g></g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
