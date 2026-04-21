import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { InvoiceRemindersService } from './invoice-reminders.service';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [PrismaModule, AccountingModule, MailModule],
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
