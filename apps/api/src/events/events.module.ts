import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsService } from './events.service';
import {
  EventsAdminResolver,
  EventsViewerResolver,
} from './events.resolver';

@Module({
  imports: [PrismaModule],
  providers: [
    EventsService,
    EventsAdminResolver,
    EventsViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [EventsService],
})
export class EventsModule {}
