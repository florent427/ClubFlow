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
import { ClubLifeService } from './club-life.service';
import { CreateAnnouncementInput } from './dto/create-announcement.input';
import { CreateSurveyInput } from './dto/create-survey.input';
import { RespondSurveyInput } from './dto/respond-survey.input';
import { UpdateAnnouncementInput } from './dto/update-announcement.input';
import { ClubAnnouncementGraph } from './models/club-announcement.model';
import { ClubSurveyGraph } from './models/club-survey.model';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.CLUB_LIFE)
export class ClubLifeAdminResolver {
  constructor(private readonly service: ClubLifeService) {}

  @Query(() => [ClubAnnouncementGraph], { name: 'clubAnnouncements' })
  clubAnnouncements(
    @CurrentClub() club: Club,
  ): Promise<ClubAnnouncementGraph[]> {
    return this.service.listAnnouncementsAdmin(club.id) as Promise<
      ClubAnnouncementGraph[]
    >;
  }

  @Mutation(() => ClubAnnouncementGraph)
  createClubAnnouncement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateAnnouncementInput,
  ): Promise<ClubAnnouncementGraph> {
    return this.service.createAnnouncement(club.id, user.userId, input) as Promise<
      ClubAnnouncementGraph
    >;
  }

  @Mutation(() => ClubAnnouncementGraph)
  updateClubAnnouncement(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateAnnouncementInput,
  ): Promise<ClubAnnouncementGraph> {
    return this.service.updateAnnouncement(club.id, input.id, {
      title: input.title,
      body: input.body,
      pinned: input.pinned,
    }) as Promise<ClubAnnouncementGraph>;
  }

  @Mutation(() => ClubAnnouncementGraph)
  publishClubAnnouncement(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubAnnouncementGraph> {
    return this.service.publishAnnouncement(club.id, id) as Promise<
      ClubAnnouncementGraph
    >;
  }

  @Mutation(() => Boolean)
  deleteClubAnnouncement(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.service.deleteAnnouncement(club.id, id);
  }

  @Query(() => [ClubSurveyGraph], { name: 'clubSurveys' })
  clubSurveys(@CurrentClub() club: Club): Promise<ClubSurveyGraph[]> {
    return this.service.listSurveysAdmin(club.id, {}) as Promise<
      ClubSurveyGraph[]
    >;
  }

  @Mutation(() => ClubSurveyGraph)
  createClubSurvey(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateSurveyInput,
  ): Promise<ClubSurveyGraph> {
    return this.service.createSurvey(club.id, user.userId, input) as Promise<
      ClubSurveyGraph
    >;
  }

  @Mutation(() => ClubSurveyGraph)
  openClubSurvey(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubSurveyGraph> {
    return this.service.openSurvey(club.id, id, {}) as Promise<ClubSurveyGraph>;
  }

  @Mutation(() => ClubSurveyGraph)
  closeClubSurvey(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubSurveyGraph> {
    return this.service.closeSurvey(club.id, id, {}) as Promise<ClubSurveyGraph>;
  }

  @Mutation(() => Boolean)
  deleteClubSurvey(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.service.deleteSurvey(club.id, id);
  }
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.CLUB_LIFE)
export class ClubLifeViewerResolver {
  constructor(private readonly service: ClubLifeService) {}

  @Query(() => [ClubAnnouncementGraph], { name: 'viewerClubAnnouncements' })
  viewerClubAnnouncements(
    @CurrentClub() club: Club,
  ): Promise<ClubAnnouncementGraph[]> {
    return this.service.listPublishedAnnouncements(club.id) as Promise<
      ClubAnnouncementGraph[]
    >;
  }

  @Query(() => [ClubSurveyGraph], { name: 'viewerClubSurveys' })
  viewerClubSurveys(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<ClubSurveyGraph[]> {
    return this.service.listPublishedSurveys(club.id, {
      memberId: user.activeProfileMemberId,
      contactId: user.activeProfileContactId,
    }) as Promise<ClubSurveyGraph[]>;
  }

  @Mutation(() => ClubSurveyGraph)
  viewerRespondToClubSurvey(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RespondSurveyInput,
  ): Promise<ClubSurveyGraph> {
    return this.service.respondToSurvey(
      club.id,
      {
        memberId: user.activeProfileMemberId,
        contactId: user.activeProfileContactId,
      },
      input,
    ) as Promise<ClubSurveyGraph>;
  }
}
