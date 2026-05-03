import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { GrantsService } from './grants.service';
import { SponsoringResolver } from './sponsoring.resolver';
import { SponsoringService } from './sponsoring.service';
import { SubsidiesResolver } from './subsidies.resolver';

@Module({
  imports: [PrismaModule, AccountingModule],
  providers: [
    GrantsService,
    SponsoringService,
    SubsidiesResolver,
    SponsoringResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [GrantsService, SponsoringService],
})
export class ExternalFinanceModule {}
