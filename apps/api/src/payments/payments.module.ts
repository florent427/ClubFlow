import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { DocumentsModule } from '../documents/documents.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoiceRemindersService } from './invoice-reminders.service';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [PrismaModule, AccountingModule, MailModule, DocumentsModule],
  controllers: [StripeWebhookController],
  providers: [
    PaymentsService,
    PaymentsResolver,
    StripeCheckoutService,
    InvoiceRemindersService,
    ClubModuleEnabledGuard,
  ],
  exports: [PaymentsService, StripeCheckoutService, InvoiceRemindersService],
})
export class PaymentsModule {}
