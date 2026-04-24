import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { AiModule } from '../ai/ai.module';
import { AccountingExportController } from './accounting-export.controller';
import { AccountingResolver } from './accounting.resolver';
import { AccountingService } from './accounting.service';
import { AccountingAllocationService } from './accounting-allocation.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingExportService } from './accounting-export.service';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingPeriodService } from './accounting-period.service';
import { ReceiptOcrService } from './receipt-ocr.service';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [AccountingExportController],
  providers: [
    AccountingService,
    AccountingAllocationService,
    AccountingMappingService,
    AccountingPeriodService,
    AccountingAuditService,
    AccountingExportService,
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
    AccountingExportService,
    ReceiptOcrService,
  ],
})
export class AccountingModule {}
