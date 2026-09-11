import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { AiModule } from '../ai/ai.module';
import { MediaModule } from '../media/media.module';
import { AccountingExportController } from './accounting-export.controller';
import { AccountingResolver } from './accounting.resolver';
import { AccountingService } from './accounting.service';
import { AccountingAllocationService } from './accounting-allocation.service';
import { AccountingAuditService } from './accounting-audit.service';
import { AccountingConsolidationService } from './accounting-consolidation.service';
import { AccountingExportService } from './accounting-export.service';
import { AccountingFiscalYearService } from './accounting-fiscal-year.service';
import { AccountingMappingService } from './accounting-mapping.service';
import { AccountingPeriodService } from './accounting-period.service';
import { AccountingSeedService } from './accounting-seed.service';
import { AccountingSuggestionService } from './accounting-suggestion.service';
import { ClubFinancialAccountsService } from './club-financial-accounts.service';
import { ClubPaymentRoutesService } from './club-payment-routes.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { BankImportResolver } from './bank-import/bank-import.resolver';
import { BankReconciliationService } from './bank-import/bank-reconciliation.service';
import { BankStatementService } from './bank-import/bank-statement.service';
import { BankStatementOcrService } from './bank-import/bank-statement-ocr.service';
import { BankStatementIntegrityService } from './bank-import/bank-statement-integrity.service';
import { PdfPageRenderer } from './ocr-shared';

@Module({
  imports: [PrismaModule, AiModule, MediaModule],
  controllers: [AccountingExportController],
  providers: [
    AccountingService,
    AccountingAllocationService,
    AccountingMappingService,
    AccountingFiscalYearService,
    AccountingPeriodService,
    AccountingAuditService,
    AccountingExportService,
    AccountingSeedService,
    AccountingSuggestionService,
    ClubFinancialAccountsService,
    ClubPaymentRoutesService,
    AccountingConsolidationService,
    ReceiptOcrService,
    BankReconciliationService,
    BankStatementService,
    BankStatementOcrService,
    BankStatementIntegrityService,
    PdfPageRenderer,
    AccountingResolver,
    BankImportResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [
    AccountingService,
    AccountingAllocationService,
    AccountingMappingService,
    AccountingFiscalYearService,
    AccountingPeriodService,
    AccountingAuditService,
    AccountingExportService,
    AccountingSeedService,
    AccountingSuggestionService,
    ClubFinancialAccountsService,
    ClubPaymentRoutesService,
    AccountingConsolidationService,
    ReceiptOcrService,
    BankReconciliationService,
    BankStatementService,
    BankStatementOcrService,
    BankStatementIntegrityService,
    PdfPageRenderer,
  ],
})
export class AccountingModule {}
