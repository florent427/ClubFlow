import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { FamiliesModule } from '../families/families.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PlanningModule } from '../planning/planning.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ViewerResolver } from './viewer.resolver';
import { ViewerService } from './viewer.service';

@Module({
  imports: [PrismaModule, PlanningModule, FamiliesModule, MessagingModule],
  providers: [
    ViewerService,
    ViewerResolver,
    ViewerActiveProfileGuard,
    ClubModuleEnabledGuard,
  ],
})
export class ViewerModule {}
