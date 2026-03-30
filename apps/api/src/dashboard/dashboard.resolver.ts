import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { AdminDashboardSummary } from './models/admin-dashboard.model';

@Resolver()
export class DashboardResolver {
  constructor(private readonly dashboard: DashboardService) {}

  @Query(() => AdminDashboardSummary)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
  adminDashboardSummary(
    @CurrentClub() club: Club,
  ): Promise<AdminDashboardSummary> {
    return this.dashboard.summary(club.id);
  }
}
