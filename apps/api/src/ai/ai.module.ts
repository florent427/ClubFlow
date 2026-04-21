import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { OpenrouterService } from './openrouter.service';
import { ArticleGeneratorService } from './article-generator.service';
import { ImageGeneratorService } from './image-generator.service';
import { AiSettingsService } from './ai-settings.service';
import { AiResolver } from './ai.resolver';

@Module({
  imports: [PrismaModule, MediaModule],
  providers: [
    OpenrouterService,
    ArticleGeneratorService,
    ImageGeneratorService,
    AiSettingsService,
    AiResolver,
  ],
  exports: [
    ArticleGeneratorService,
    ImageGeneratorService,
    AiSettingsService,
    OpenrouterService,
  ],
})
export class AiModule {}
