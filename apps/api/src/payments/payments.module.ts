import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [StripeWebhookController],
  providers: [
    PaymentsService,
    PaymentsResolver,
    StripeCheckoutService,
    ClubModuleEnabledGuard,
  ],
  exports: [PaymentsService, StripeCheckoutService],
})
export class PaymentsModule {}
