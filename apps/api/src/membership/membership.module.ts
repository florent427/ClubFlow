import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { MembershipResolver } from './membership.resolver';
import { MembershipService } from './membership.service';

@Module({
  imports: [PrismaModule],
  providers: [MembershipService, MembershipResolver, ClubModuleEnabledGuard],
  exports: [MembershipService],
})
export class MembershipModule {}
