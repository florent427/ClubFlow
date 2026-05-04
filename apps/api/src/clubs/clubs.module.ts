import { Module } from '@nestjs/common';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { InfraModule } from '../infra/infra.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubsResolver } from './clubs.resolver';
import { ClubsService } from './clubs.service';
import { VitrineDomainCron } from './vitrine-domain.cron';
import { VitrineDomainResolver } from './vitrine-domain.resolver';

@Module({
  imports: [PrismaModule, InfraModule],
  providers: [
    ClubsResolver,
    ClubsService,
    VitrineDomainResolver,
    VitrineDomainCron,
    // Guards locaux pour VitrineDomainResolver (pattern identique au reste du repo)
    ClubContextGuard,
    ClubAdminRoleGuard,
  ],
  exports: [ClubsService],
})
export class ClubsModule {}
