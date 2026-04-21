import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicePdfController } from './invoice-pdf.controller';
import { InvoicePdfService } from './invoice-pdf.service';

@Module({
  imports: [PrismaModule],
  controllers: [InvoicePdfController],
  providers: [InvoicePdfService],
  exports: [InvoicePdfService],
})
export class PdfModule {}
