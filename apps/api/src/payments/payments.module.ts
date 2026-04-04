import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { PaymentsResolver } from './payments.resolver';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [StripeWebhookController],
  providers: [PaymentsService, PaymentsResolver, ClubModuleEnabledGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
