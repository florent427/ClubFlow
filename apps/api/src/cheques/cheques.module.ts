import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ExternalFinanceModule } from '../external-finance/external-finance.module';
import { MediaModule } from '../media/media.module';
import { PdfModule } from '../pdf/pdf.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChequeDepositsService } from './cheque-deposits.service';
import { ChequesResolver } from './cheques.resolver';
import { ChequesService } from './cheques.service';

/**
 * Chèques et remises (ADR-0015). Module à part : il dépend de la compta, des
 * subventions et du sponsoring (rattachement des tranches), des médias
 * (photos, bordereau) et du PDF — et rien ne dépend de lui.
 */
@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    ExternalFinanceModule,
    MediaModule,
    PdfModule,
  ],
  providers: [
    ChequesService,
    ChequeDepositsService,
    ChequesResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [ChequesService, ChequeDepositsService],
})
export class ChequesModule {}
