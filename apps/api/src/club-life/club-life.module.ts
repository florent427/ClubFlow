import { Module } from '@nestjs/common';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubLifeService } from './club-life.service';
import {
  ClubLifeAdminResolver,
  ClubLifeViewerResolver,
} from './club-life.resolver';

@Module({
  imports: [PrismaModule],
  providers: [
    ClubLifeService,
    ClubLifeAdminResolver,
    ClubLifeViewerResolver,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [ClubLifeService],
})
export class ClubLifeModule {}
