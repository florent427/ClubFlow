import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { SponsoringResolver } from './sponsoring.resolver';
import { SubsidiesResolver } from './subsidies.resolver';

@Module({
  imports: [PrismaModule],
  providers: [SubsidiesResolver, SponsoringResolver, ClubModuleEnabledGuard],
})
export class ExternalFinanceModule {}
