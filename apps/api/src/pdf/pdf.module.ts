import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChequeDepositPdfService } from './cheque-deposit-pdf.service';
import { InvoicePdfController } from './invoice-pdf.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { ShopDeliveryNotePdfService } from './shop-delivery-note-pdf.service';
import { ShopExchangeNotePdfService } from './shop-exchange-note-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvoicePdfController],
  providers: [
    InvoicePdfService,
    ChequeDepositPdfService,
    ShopDeliveryNotePdfService,
    ShopExchangeNotePdfService,
  ],
  exports: [
    InvoicePdfService,
    ChequeDepositPdfService,
    ShopDeliveryNotePdfService,
    ShopExchangeNotePdfService,
  ],
})
export class PdfModule {}
