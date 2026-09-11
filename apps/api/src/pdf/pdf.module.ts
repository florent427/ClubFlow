import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChequeDepositPdfService } from './cheque-deposit-pdf.service';
import { InvoicePdfController } from './invoice-pdf.controller';
import { InvoicePdfService } from './invoice-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvoicePdfController],
  providers: [InvoicePdfService, ChequeDepositPdfService],
  exports: [InvoicePdfService, ChequeDepositPdfService],
})
export class PdfModule {}
