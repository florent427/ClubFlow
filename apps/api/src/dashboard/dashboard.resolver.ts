import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ClubSearchService } from './club-search.service';
import { DashboardService } from './dashboard.service';
import { AdminDashboardSummary } from './models/admin-dashboard.model';
import { ClubSearchResults } from './models/club-search.model';

@Resolver()
export class DashboardResolver {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly searchService: ClubSearchService,
  ) {}

  @Query(() => AdminDashboardSummary)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
  adminDashboardSummary(
    @CurrentClub() club: Club,
  ): Promise<AdminDashboardSummary> {
    return this.dashboard.summary(club.id);
  }

  @Query(() => ClubSearchResults, { name: 'clubSearch' })
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
  clubSearch(
    @CurrentClub() club: Club,
    @Args('q') q: string,
  ): Promise<ClubSearchResults> {
    return this.searchService.search(club.id, q);
  }
}
