import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerMemberGraph } from './models/viewer-member.model';
import { ViewerService } from './viewer.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
export class ViewerResolver {
  constructor(private readonly viewer: ViewerService) {}

  @Query(() => ViewerMemberGraph, { name: 'viewerMe' })
  viewerMe(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerMemberGraph> {
    return this.viewer.viewerMe(club.id, user.activeProfileMemberId!);
  }

  @Query(() => [ViewerCourseSlotGraph], { name: 'viewerUpcomingCourseSlots' })
  @RequireClubModule(ModuleCode.PLANNING)
  viewerUpcomingCourseSlots(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerCourseSlotGraph[]> {
    return this.viewer.viewerUpcomingCourseSlots(
      club.id,
      user.activeProfileMemberId!,
    );
  }

  @Query(() => ViewerFamilyBillingSummaryGraph, {
    name: 'viewerFamilyBillingSummary',
  })
  @RequireClubModule(ModuleCode.PAYMENT)
  viewerFamilyBillingSummary(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerFamilyBillingSummaryGraph> {
    return this.viewer.viewerFamilyBillingSummary(
      club.id,
      user.activeProfileMemberId!,
    );
  }
}
