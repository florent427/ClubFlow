import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubCommManagerRoleGuard } from '../common/guards/club-comm-manager-role.guard';
import {
  AiSettingsService,
  CURATED_IMAGE_MODELS,
  CURATED_TEXT_MODELS,
} from './ai-settings.service';
import { ArticleGeneratorService } from './article-generator.service';
import { ImageGeneratorService } from './image-generator.service';
import { VitrineArticleGenerationService } from './vitrine-article-generation.service';
import {
  GenerateVitrineArticleDraftInput,
  UpdateAiSettingsInput,
} from './dto/ai-inputs';
import {
  AiArticleDraftGraph,
  AiSettingsGraph,
  AiUsageLogGraph,
  StartVitrineArticleGenerationResult,
} from './models/ai-models';

@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubCommManagerRoleGuard)
export class AiResolver {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly articleGen: ArticleGeneratorService,
    private readonly imageGen: ImageGeneratorService,
    private readonly vitrineGen: VitrineArticleGenerationService,
  ) {}

  // ============ Settings ============

  @Query(() => AiSettingsGraph, { name: 'clubAiSettings' })
  async clubAiSettings(@CurrentClub() club: Club): Promise<AiSettingsGraph> {
    const s = await this.settings.get(club.id);
    return {
      apiKeyMasked: s.apiKeyMasked,
      hasApiKey: s.hasApiKey,
      textModel: s.textModel,
      textFallbackModel: s.textFallbackModel,
      imageModel: s.imageModel,
      tokensInputUsed: s.tokensInputUsed,
      tokensOutputUsed: s.tokensOutputUsed,
      imagesGenerated: s.imagesGenerated,
      curatedTextModels: [...CURATED_TEXT_MODELS],
      curatedImageModels: [...CURATED_IMAGE_MODELS],
    };
  }

  @Mutation(() => AiSettingsGraph)
  async updateClubAiSettings(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateAiSettingsInput,
  ): Promise<AiSettingsGraph> {
    const s = await this.settings.update(club.id, {
      apiKey: input.apiKey,
      clearApiKey: input.clearApiKey,
      textModel: input.textModel,
      textFallbackModel: input.textFallbackModel,
      imageModel: input.imageModel,
    });
    return {
      apiKeyMasked: s.apiKeyMasked,
      hasApiKey: s.hasApiKey,
      textModel: s.textModel,
      textFallbackModel: s.textFallbackModel,
      imageModel: s.imageModel,
      tokensInputUsed: s.tokensInputUsed,
      tokensOutputUsed: s.tokensOutputUsed,
      imagesGenerated: s.imagesGenerated,
      curatedTextModels: [...CURATED_TEXT_MODELS],
      curatedImageModels: [...CURATED_IMAGE_MODELS],
    };
  }

  @Query(() => [AiUsageLogGraph], { name: 'clubAiUsageLogs' })
  async clubAiUsageLogs(
    @CurrentClub() club: Club,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<AiUsageLogGraph[]> {
    const rows = await this.settings.listUsage(club.id, limit ?? 50);
    return rows;
  }

  // ============ Article generation ============

  @Mutation(() => AiArticleDraftGraph)
  async generateVitrineArticleDraft(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: GenerateVitrineArticleDraftInput,
  ): Promise<AiArticleDraftGraph> {
    const apiKey = await this.settings.getDecryptedApiKey(club.id);
    const { textModel, imageModel } = await this.settings.getModels(club.id);

    // 1. Générer le texte
    const { draft, usage: textUsage } = await this.articleGen.generate({
      apiKey,
      textModel,
      sourceText: input.sourceText,
      tone: input.tone,
      inlineImageSlots: input.inlineImageCount ?? 3,
    });

    // Log texte
    await this.settings.logUsage({
      clubId: club.id,
      userId: user.userId,
      feature: 'ARTICLE_GENERATION',
      model: textUsage.model,
      inputTokens: textUsage.inputTokens,
      outputTokens: textUsage.outputTokens,
      imagesGenerated: 0,
      costCents: textUsage.costCents,
    });

    let totalInputTokens = textUsage.inputTokens;
    let totalOutputTokens = textUsage.outputTokens;
    let totalImagesGenerated = 0;

    const useAiImages = input.useAiImages !== false;

    // 2. Générer l'image featured si demandé ET si le mode image est activé.
    //    Si useAiImages=false, on laisse `featuredImageUrl` à null et le
    //    frontend insérera un placeholder SVG.
    let featuredImageAssetId: string | null = null;
    let featuredImageUrl: string | null = null;
    if (
      useAiImages &&
      input.generateFeaturedImage !== false &&
      draft.featuredImagePrompt
    ) {
      try {
        const featured = await this.imageGen.generateAndUpload({
          clubId: club.id,
          userId: user.userId,
          apiKey,
          imageModel,
          prompt: draft.featuredImagePrompt,
          ownerKind: 'VITRINE_ARTICLE',
        });
        featuredImageAssetId = featured.mediaAssetId;
        featuredImageUrl = featured.publicUrl;
        totalInputTokens += featured.inputTokens;
        totalOutputTokens += featured.outputTokens;
        totalImagesGenerated += 1;
        await this.settings.logUsage({
          clubId: club.id,
          userId: user.userId,
          feature: 'IMAGE_GENERATION',
          model: featured.model,
          inputTokens: featured.inputTokens,
          outputTokens: featured.outputTokens,
          imagesGenerated: 1,
        });
      } catch (err) {
        // On n'échoue pas toute la mutation si une image plante.
        console.error('[AI] featured image generation failed', err);
      }
    }

    // 3. Générer les images inline (sections avec inlineImagePrompt).
    //    Si useAiImages=false, on conserve `inlineImagePrompt`/`inlineImageAlt`
    //    mais les URLs restent null → le frontend insère des placeholders SVG.
    const sectionsOut = await Promise.all(
      draft.sections.map(async (section) => {
        let assetId: string | null = null;
        let url: string | null = null;
        if (useAiImages && section.inlineImagePrompt) {
          try {
            const inline = await this.imageGen.generateAndUpload({
              clubId: club.id,
              userId: user.userId,
              apiKey,
              imageModel,
              prompt: section.inlineImagePrompt,
              ownerKind: 'VITRINE_ARTICLE',
            });
            assetId = inline.mediaAssetId;
            url = inline.publicUrl;
            totalInputTokens += inline.inputTokens;
            totalOutputTokens += inline.outputTokens;
            totalImagesGenerated += 1;
            await this.settings.logUsage({
              clubId: club.id,
              userId: user.userId,
              feature: 'IMAGE_GENERATION',
              model: inline.model,
              inputTokens: inline.inputTokens,
              outputTokens: inline.outputTokens,
              imagesGenerated: 1,
            });
          } catch (err) {
            console.error('[AI] inline image generation failed', err);
          }
        }
        return {
          h2: section.h2,
          paragraphs: section.paragraphs,
          inlineImagePrompt: section.inlineImagePrompt,
          inlineImageAlt: section.inlineImageAlt,
          inlineImageAssetId: assetId,
          inlineImageUrl: url,
        };
      }),
    );

    return {
      title: draft.title,
      slug: draft.slug,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      excerpt: draft.excerpt,
      h1: draft.h1,
      sections: sectionsOut,
      faq: draft.faq,
      keywords: draft.keywords,
      featuredImagePrompt: draft.featuredImagePrompt,
      featuredImageAlt: draft.featuredImageAlt,
      featuredImageAssetId,
      featuredImageUrl,
      totalInputTokens,
      totalOutputTokens,
      totalImagesGenerated,
    };
  }

  // ============ Async article generation (background) ============

  /**
   * Démarre la génération d'un article en arrière-plan. Retourne
   * immédiatement l'ID du brouillon créé (status=PENDING). Le frontend
   * peut fermer la modale et poll la liste des articles pour suivre la
   * progression.
   */
  @Mutation(() => StartVitrineArticleGenerationResult)
  async startVitrineArticleGeneration(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: GenerateVitrineArticleDraftInput,
  ): Promise<StartVitrineArticleGenerationResult> {
    const articleId = await this.vitrineGen.start({
      clubId: club.id,
      userId: user.userId,
      sourceText: input.sourceText,
      tone: input.tone,
      generateFeaturedImage: input.generateFeaturedImage,
      inlineImageCount: input.inlineImageCount,
      useAiImages: input.useAiImages,
      useWebSearch: input.useWebSearch,
    });
    return { articleId };
  }
}
