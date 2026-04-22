import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { VitrineModule } from '../vitrine/vitrine.module';
import { OpenrouterService } from './openrouter.service';
import { ArticleGeneratorService } from './article-generator.service';
import { ImageGeneratorService } from './image-generator.service';
import { AiSettingsService } from './ai-settings.service';
import { VitrineArticleGenerationService } from './vitrine-article-generation.service';
import { CommentModerationService } from './comment-moderation.service';
import { CommentReplyService } from './comment-reply.service';
import { AiResolver } from './ai.resolver';

@Module({
  imports: [PrismaModule, MediaModule, forwardRef(() => VitrineModule)],
  providers: [
    OpenrouterService,
    ArticleGeneratorService,
    ImageGeneratorService,
    AiSettingsService,
    VitrineArticleGenerationService,
    CommentModerationService,
    CommentReplyService,
    AiResolver,
  ],
  exports: [
    ArticleGeneratorService,
    ImageGeneratorService,
    AiSettingsService,
    OpenrouterService,
    CommentModerationService,
    CommentReplyService,
  ],
})
export class AiModule {}
