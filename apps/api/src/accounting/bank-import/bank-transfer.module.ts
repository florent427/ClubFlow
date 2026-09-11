import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting.module';
import { PaymentsModule } from '../../payments/payments.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BankMemberTransferService } from './bank-member-transfer.service';
import { BankTransferResolver } from './bank-transfer.resolver';

/**
 * Encaissement des virements d'adhérents depuis un relevé (ADR-0014 §7).
 *
 * Module séparé à dessein : il a besoin des paiements, qui ont besoin de la
 * comptabilité. Le loger dans la comptabilité fermerait le cercle. Ici, la
 * dépendance ne va que dans un sens.
 */
@Module({
  imports: [PrismaModule, AccountingModule, PaymentsModule],
  providers: [BankMemberTransferService, BankTransferResolver],
  exports: [BankMemberTransferService],
})
export class BankTransferModule {}
