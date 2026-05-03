import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { MailModule } from '../mail/mail.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContactsResolver } from './club-contacts.resolver';
import { ClubContactsService } from './club-contacts.service';
import { MemberAccountActivationService } from './member-account-activation.service';
import { MemberFieldConfigService } from './member-field-config.service';
import { MemberGraphResolver } from './member-graph.resolver';
import { MembersResolver } from './members.resolver';
import { MembersService } from './members.service';

@Module({
  imports: [
    PrismaModule,
    FamiliesModule,
    MessagingModule,
    forwardRef(() => MembershipModule),
    forwardRef(() => AuthModule),
    MailModule,
  ],
  providers: [
    MemberFieldConfigService,
    MembersService,
    ClubContactsService,
    MemberAccountActivationService,
    MemberGraphResolver,
    MembersResolver,
    ClubContactsResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [
    MembersService,
    MemberFieldConfigService,
    ClubContactsService,
    MemberAccountActivationService,
  ],
})
export class MembersModule {}
