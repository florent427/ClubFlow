import { Module } from '@nestjs/common';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubTeamResolver } from './club-team.resolver';
import { ClubTeamService } from './club-team.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ClubTeamResolver,
    ClubTeamService,
    ClubContextGuard,
    ClubAdminRoleGuard,
  ],
  exports: [ClubTeamService],
})
export class ClubTeamModule {}
