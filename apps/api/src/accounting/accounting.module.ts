import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { AiModule } from '../ai/ai.module';
import { AccountingResolver } from './accounting.resolver';
import { AccountingService } from './accounting.service';
import { AccountingAllocationService } from './accounting-allocation.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingPeriodService } from './accounting-period.service';
import { ReceiptOcrService } from './receipt-ocr.service';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [
    AccountingService,
    AccountingAllocationService,
    AccountingMappingService,
    AccountingPeriodService,
    AccountingAuditService,
    ReceiptOcrService,
    AccountingResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [
    AccountingService,
    AccountingAllocationService,
    AccountingMappingService,
    AccountingPeriodService,
    AccountingAuditService,
    ReceiptOcrService,
  ],
})
export class AccountingModule {}
