import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsCronService } from './documents-cron.service';
import { DocumentsGatingService } from './documents-gating.service';
import { DocumentsResolver } from './documents.resolver';
import { DocumentsSeedService } from './documents-seed.service';
import { DocumentsService } from './documents.service';
import { PdfSigningService } from './pdf-signing.service';
import { ViewerDocumentsResolver } from './viewer-documents.resolver';

@Module({
  imports: [PrismaModule, MediaModule, AuthModule, MailModule],
  providers: [
    DocumentsService,
    DocumentsGatingService,
    DocumentsCronService,
    DocumentsSeedService,
    PdfSigningService,
    DocumentsResolver,
    ViewerDocumentsResolver,
    ClubModuleEnabledGuard,
  ],
  controllers: [DocumentsController],
  exports: [DocumentsService, DocumentsGatingService],
})
export class DocumentsModule {}
