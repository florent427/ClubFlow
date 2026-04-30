import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsResolver } from './documents.resolver';
import { DocumentsService } from './documents.service';
import { PdfSigningService } from './pdf-signing.service';
import { ViewerDocumentsResolver } from './viewer-documents.resolver';

@Module({
  imports: [PrismaModule, MediaModule, AuthModule],
  providers: [
    DocumentsService,
    PdfSigningService,
    DocumentsResolver,
    ViewerDocumentsResolver,
    ClubModuleEnabledGuard,
  ],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
