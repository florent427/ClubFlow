import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { BookableSlotGraph, SlotBookingGraph } from './models/bookable-slot.model';
import { BookingService } from './booking.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.BOOKING)
export class BookingAdminResolver {
  constructor(private readonly service: BookingService) {}

  @Query(() => [SlotBookingGraph], { name: 'clubCourseSlotBookings' })
  clubCourseSlotBookings(
    @CurrentClub() club: Club,
    @Args('slotId', { type: () => ID }) slotId: string,
  ): Promise<SlotBookingGraph[]> {
    return this.service.listSlotBookings(
      club.id,
      slotId,
    ) as Promise<SlotBookingGraph[]>;
  }
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.BOOKING)
export class BookingViewerResolver {
  constructor(private readonly service: BookingService) {}

  @Query(() => [BookableSlotGraph], { name: 'viewerBookableCourseSlots' })
  async viewerBookableCourseSlots(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<BookableSlotGraph[]> {
    if (!user.activeProfileMemberId) return [];
    return this.service.listBookableSlotsForMember(
      club.id,
      user.activeProfileMemberId,
    ) as Promise<BookableSlotGraph[]>;
  }

  @Mutation(() => Boolean)
  async viewerBookCourseSlot(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('slotId', { type: () => ID }) slotId: string,
    @Args('note', { type: () => String, nullable: true }) note: string | null,
  ): Promise<boolean> {
    if (!user.activeProfileMemberId) return false;
    await this.service.book(
      club.id,
      user.activeProfileMemberId,
      slotId,
      note ?? undefined,
    );
    return true;
  }

  @Mutation(() => Boolean)
  async viewerCancelCourseSlotBooking(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('slotId', { type: () => ID }) slotId: string,
  ): Promise<boolean> {
    if (!user.activeProfileMemberId) return false;
    await this.service.cancel(club.id, user.activeProfileMemberId, slotId);
    return true;
  }
}
