import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { DocumentsModule } from '../documents/documents.module';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicePayerScopeService } from './invoice-payer-scope.service';
import { InvoiceRemindersService } from './invoice-reminders.service';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { PaymentScheduleAdminResolver } from './payment-schedule-admin.resolver';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleResolver } from './payment-schedule.resolver';
import { PaymentScheduleService } from './payment-schedule.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeConnectResolver } from './stripe-connect.resolver';
import { StripeConnectService } from './stripe-connect.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    MailModule,
    DocumentsModule,
    // Périmètre payeur (InvoicePayerScopeService) + ViewerActiveProfileGuard.
    FamiliesModule,
  ],
  controllers: [StripeWebhookController],
  providers: [
    PaymentsService,
    PaymentsResolver,
    StripeCheckoutService,
    StripeConnectService,
    StripeConnectResolver,
    PaymentScheduleService,
    PaymentScheduleEngineService,
    PaymentScheduleResolver,
    PaymentScheduleAdminResolver,
    InvoicePayerScopeService,
    InvoiceRemindersService,
    ClubModuleEnabledGuard,
    ViewerActiveProfileGuard,
  ],
  exports: [
    PaymentsService,
    StripeCheckoutService,
    StripeConnectService,
    PaymentScheduleService,
    // Exporté pour que ViewerService partage la MÊME règle « seul le payeur ».
    InvoicePayerScopeService,
    InvoiceRemindersService,
  ],
})
export class PaymentsModule {}
