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
import { PayerCreditRefundsService } from './payer-credit-refunds.service';
import { ManualPaymentCancellationService } from './manual-payment-cancellation.service';
import { PayerCreditResolver } from './payer-credit.resolver';
import { PayerCreditService } from './payer-credit.service';
import { ViewerPayerCreditResolver } from './viewer-payer-credit.resolver';
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
import { StripeTransitResolver } from './stripe-transit.resolver';
import { StripeTransitSyncService } from './stripe-transit-sync.service';
import { CreditNotesService } from './credit-notes.service';
import { ShopOrderAdjustmentsResolver } from './shop-order-adjustments.resolver';
import { ShopOrderAdjustmentsService } from './shop-order-adjustments.service';
import { ShopOrderMoneyService } from './shop-order-money.service';
import { ShopOrderRefundsResolver } from './shop-order-refunds.resolver';
import { ShopOrderRefundsService } from './shop-order-refunds.service';
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
    // Crédit du payeur : avances encaissées sans facture (ADR-0022).
    PayerCreditService,
    PayerCreditResolver,
    // Rembourser une avance hors carte (tâche 4.2).
    PayerCreditRefundsService,
    // Annuler un encaissement saisi par erreur.
    ManualPaymentCancellationService,
    // Le crédit du compte connecté, au portail et dans l'appli (lot 3).
    ViewerPayerCreditResolver,
    StripeCheckoutService,
    StripeConnectService,
    StripeConnectResolver,
    StripeFeesService,
    StripeRefundsService,
    StripeTransitSyncService,
    StripeTransitResolver,
    CreditNotesService,
    // Annuler et rembourser une commande boutique (ADR-0019), ajuster une
    // ligne (ADR-0020) : l'argent de la commande passe par un seul service.
    ShopOrderMoneyService,
    ShopOrderRefundsService,
    ShopOrderRefundsResolver,
    // Échanger ou annuler un article (ADR-0020).
    ShopOrderAdjustmentsService,
    ShopOrderAdjustmentsResolver,
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
    PayerCreditService,
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
