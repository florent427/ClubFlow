import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { AiModule } from '../ai/ai.module';
import { VitrineAdminResolver } from './vitrine-admin.resolver';
import { VitrineCategoryService } from './vitrine-category.service';
import { VitrineCommentService } from './vitrine-comment.service';
import { VitrineContactService } from './vitrine-contact.service';
import { VitrineContentService } from './vitrine-content.service';
import { VitrineIsrService } from './vitrine-isr.service';
import { VitrinePageService } from './vitrine-page.service';
import { VitrinePublicResolver } from './vitrine-public.resolver';
import { VitrineSettingsService } from './vitrine-settings.service';

@Module({
  imports: [
    PrismaModule,
    MediaModule,
    forwardRef(() => AiModule),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-development',
    }),
  ],
  providers: [
    VitrinePageService,
    VitrineContentService,
    VitrineCategoryService,
    VitrineCommentService,
    VitrineContactService,
    VitrineIsrService,
    VitrineSettingsService,
    VitrineAdminResolver,
    VitrinePublicResolver,
  ],
  exports: [
    VitrinePageService,
    VitrineContentService,
    VitrineCategoryService,
    VitrineCommentService,
    VitrineContactService,
    VitrineIsrService,
    VitrineSettingsService,
  ],
})
export class VitrineModule {}
