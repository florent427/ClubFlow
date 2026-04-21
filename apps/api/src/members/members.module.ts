import { forwardRef, Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContactsResolver } from './club-contacts.resolver';
import { ClubContactsService } from './club-contacts.service';
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
  ],
  providers: [
    MemberFieldConfigService,
    MembersService,
    ClubContactsService,
    MemberGraphResolver,
    MembersResolver,
    ClubContactsResolver,
    ClubModuleEnabledGuard,
  ],
  exports: [MembersService, MemberFieldConfigService, ClubContactsService],
})
export class MembersModule {}
