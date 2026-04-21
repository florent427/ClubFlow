import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { VitrineAdminResolver } from './vitrine-admin.resolver';
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
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-development',
    }),
  ],
  providers: [
    VitrinePageService,
    VitrineContentService,
    VitrineContactService,
    VitrineIsrService,
    VitrineSettingsService,
    VitrineAdminResolver,
    VitrinePublicResolver,
  ],
  exports: [
    VitrinePageService,
    VitrineContentService,
    VitrineContactService,
    VitrineIsrService,
    VitrineSettingsService,
  ],
})
export class VitrineModule {}
