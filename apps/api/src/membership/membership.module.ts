import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { MembershipResolver } from './membership.resolver';
import { MembershipService } from './membership.service';
import { MembershipCartService } from './membership-cart.service';
import { MembershipCartAdminResolver } from './membership-cart.resolver';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [
    MembershipService,
    MembershipResolver,
    MembershipCartService,
    MembershipCartAdminResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [MembershipService, MembershipCartService],
})
export class MembershipModule {}
