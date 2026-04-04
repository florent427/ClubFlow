import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CreateCourseSlotInput } from './dto/create-course-slot.input';
import { CreateVenueInput } from './dto/create-venue.input';
import { UpdateCourseSlotInput } from './dto/update-course-slot.input';
import { CourseSlotGraph } from './models/course-slot.model';
import { VenueGraph } from './models/venue.model';
import { PlanningService } from './planning.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PLANNING)
export class PlanningResolver {
  constructor(private readonly planning: PlanningService) {}

  @Query(() => [VenueGraph], { name: 'clubVenues' })
  clubVenues(@CurrentClub() club: Club): Promise<VenueGraph[]> {
    return this.planning.listVenues(club.id);
  }

  @Mutation(() => VenueGraph)
  createClubVenue(
    @CurrentClub() club: Club,
    @Args('input') input: CreateVenueInput,
  ): Promise<VenueGraph> {
    return this.planning.createVenue(club.id, input);
  }

  @Query(() => [CourseSlotGraph], { name: 'clubCourseSlots' })
  clubCourseSlots(@CurrentClub() club: Club): Promise<CourseSlotGraph[]> {
    return this.planning.listCourseSlots(club.id);
  }

  @Mutation(() => CourseSlotGraph)
  createClubCourseSlot(
    @CurrentClub() club: Club,
    @Args('input') input: CreateCourseSlotInput,
  ): Promise<CourseSlotGraph> {
    return this.planning.createCourseSlot(club.id, input);
  }

  @Mutation(() => CourseSlotGraph)
  updateClubCourseSlot(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateCourseSlotInput,
  ): Promise<CourseSlotGraph> {
    return this.planning.updateCourseSlot(club.id, input);
  }

  @Mutation(() => Boolean)
  async deleteClubCourseSlot(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.planning.deleteCourseSlot(club.id, id);
    return true;
  }
}
