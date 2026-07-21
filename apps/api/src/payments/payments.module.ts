import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import { DocumentsModule } from '../documents/documents.module';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShopModule } from '../shop/shop.module';
import { InvoicePayerScopeService } from './invoice-payer-scope.service';
import { InvoiceRemindersService } from './invoice-reminders.service';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { PaymentScheduleAdminResolver } from './payment-schedule-admin.resolver';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { PaymentScheduleNotifierService } from './payment-schedule-notifier.service';
import { PaymentScheduleResolver } from './payment-schedule.resolver';
import { PaymentScheduleService } from './payment-schedule.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeConnectResolver } from './stripe-connect.resolver';
import { StripeConnectService } from './stripe-connect.service';
import { StripeFeesService } from './stripe-fees.service';
import { StripeRefundsService } from './stripe-refunds.service';
import { CreditNotesService } from './credit-notes.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    MailModule,
    DocumentsModule,
    // Périmètre payeur (InvoicePayerScopeService) + ViewerActiveProfileGuard.
    FamiliesModule,
    // Le webhook « facture payée » solde la commande boutique et sort le stock
    // via `ShopService.fulfillPaidShopOrderInTx`. Sens unique : le module
    // boutique ne dépend PAS du module paiements (le checkout panier est
    // orchestré dans la couche viewer), donc aucun cycle.
    ShopModule,
  ],
  controllers: [StripeWebhookController],
  providers: [
    PaymentsService,
    PaymentsResolver,
    StripeCheckoutService,
    StripeConnectService,
    StripeConnectResolver,
    StripeFeesService,
    StripeRefundsService,
    CreditNotesService,
    PaymentScheduleService,
    PaymentScheduleEngineService,
    PaymentScheduleNotifierService,
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
    StripeRefundsService,
    CreditNotesService,
    PaymentScheduleService,
    // Exporté pour que ViewerService partage la MÊME règle « seul le payeur ».
    InvoicePayerScopeService,
    InvoiceRemindersService,
  ],
})
export class PaymentsModule {}
