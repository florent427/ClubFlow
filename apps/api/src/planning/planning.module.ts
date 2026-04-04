import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { PlanningResolver } from './planning.resolver';
import { PlanningService } from './planning.service';

@Module({
  imports: [PrismaModule],
  providers: [PlanningService, PlanningResolver, ClubModuleEnabledGuard],
  exports: [PlanningService],
})
export class PlanningModule {}
