import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { MemberPseudoService } from '../messaging/member-pseudo.service';
import { MembershipResolver } from './membership.resolver';
import { MembershipService } from './membership.service';
import { MembershipCartService } from './membership-cart.service';
import { MembershipCartAdminResolver } from './membership-cart.resolver';
import { PricingRulesAdminResolver } from './pricing-rules-admin.resolver';
import { PricingRulesAdminService } from './pricing-rules-admin.service';
import { PricingRulesEngineService } from './pricing-rules-engine.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [
    MembershipService,
    MembershipResolver,
    MembershipCartService,
    MembershipCartAdminResolver,
    MemberPseudoService,
    PricingRulesAdminService,
    PricingRulesAdminResolver,
    PricingRulesEngineService,
    ClubModuleEnabledGuard,
  ],
  exports: [
    MembershipService,
    MembershipCartService,
    PricingRulesEngineService,
  ],
})
export class MembershipModule {}
