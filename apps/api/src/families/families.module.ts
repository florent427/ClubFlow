import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { FamiliesResolver } from './families.resolver';
import { FamiliesService } from './families.service';

@Module({
  imports: [PrismaModule],
  providers: [FamiliesService, FamiliesResolver, ClubModuleEnabledGuard],
  exports: [FamiliesService],
})
export class FamiliesModule {}
