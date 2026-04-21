import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventAttachmentsController } from './event-attachments.controller';
import { EventAttachmentsService } from './event-attachments.service';
import { EventsService } from './events.service';
import {
  EventsAdminResolver,
  EventsViewerResolver,
} from './events.resolver';

@Module({
  imports: [PrismaModule, FamiliesModule, MailModule],
  controllers: [EventAttachmentsController],
  providers: [
    EventsService,
    EventAttachmentsService,
    EventsAdminResolver,
    EventsViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [EventsService, EventAttachmentsService],
})
export class EventsModule {}
