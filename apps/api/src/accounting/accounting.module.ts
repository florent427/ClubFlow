import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { AccountingResolver } from './accounting.resolver';
import { AccountingService } from './accounting.service';

@Module({
  imports: [PrismaModule],
  providers: [AccountingService, AccountingResolver, ClubModuleEnabledGuard],
  exports: [AccountingService],
})
export class AccountingModule {}
