import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContactsResolver } from './club-contacts.resolver';
import { ClubContactsService } from './club-contacts.service';
import { MemberFieldConfigService } from './member-field-config.service';
import { MemberGraphResolver } from './member-graph.resolver';
import { MembersResolver } from './members.resolver';
import { MembersService } from './members.service';

@Module({
  imports: [PrismaModule, FamiliesModule],
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
