import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { DocumentsModule } from '../documents/documents.module';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAttachmentsController } from './event-attachments.controller';
import { EventAttachmentsService } from './event-attachments.service';
import { EventsPublicResolver } from './events-public.resolver';
import { EventsService } from './events.service';
import {
  EventsAdminResolver,
  EventsViewerResolver,
} from './events.resolver';

@Module({
  imports: [
    PrismaModule,
    FamiliesModule,
    MailModule,
    DocumentsModule,
    MediaModule,
  ],
  controllers: [EventAttachmentsController],
  providers: [
    EventsService,
    EventAttachmentsService,
    EventsAdminResolver,
    EventsViewerResolver,
    EventsPublicResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [EventsService, EventAttachmentsService],
})
export class EventsModule {}
