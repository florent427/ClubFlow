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
import { CreateEventInput } from './dto/create-event.input';
import { SendEventConvocationInput } from './dto/send-event-convocation.input';
import { UpdateEventInput } from './dto/update-event.input';
import { ClubEventGraph } from './models/club-event.model';
import { EventConvocationResult } from './models/event-convocation-result.model';
import { EventsService } from './events.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.EVENTS)
export class EventsAdminResolver {
  constructor(private readonly service: EventsService) {}

  @Query(() => [ClubEventGraph], { name: 'clubEvents' })
  clubEvents(@CurrentClub() club: Club): Promise<ClubEventGraph[]> {
    return this.service.listAdmin(club.id) as Promise<ClubEventGraph[]>;
  }

  @Mutation(() => ClubEventGraph)
  createClubEvent(
    @CurrentClub() club: Club,
    @Args('input') input: CreateEventInput,
  ): Promise<ClubEventGraph> {
    return this.service.create(club.id, input) as Promise<ClubEventGraph>;
  }

  @Mutation(() => ClubEventGraph)
  updateClubEvent(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateEventInput,
  ): Promise<ClubEventGraph> {
    const { id, ...rest } = input;
    return this.service.update(club.id, id, rest) as Promise<ClubEventGraph>;
  }

  @Mutation(() => ClubEventGraph)
  publishClubEvent(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubEventGraph> {
    return this.service.publish(club.id, id) as Promise<ClubEventGraph>;
  }

  @Mutation(() => ClubEventGraph)
  cancelClubEvent(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubEventGraph> {
    return this.service.cancel(club.id, id) as Promise<ClubEventGraph>;
  }

  @Mutation(() => Boolean)
  deleteClubEvent(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.service.remove(club.id, id);
  }

  @Mutation(() => ClubEventGraph)
  adminRegisterMemberToEvent(
    @CurrentClub() club: Club,
    @Args('eventId', { type: () => ID }) eventId: string,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('note', { type: () => String, nullable: true }) note: string | null,
  ): Promise<ClubEventGraph> {
    return this.service.adminRegisterMember(
      club.id,
      eventId,
      memberId,
      note ?? undefined,
    ) as Promise<ClubEventGraph>;
  }

  @Mutation(() => ClubEventGraph)
  adminCancelEventRegistration(
    @CurrentClub() club: Club,
    @Args('registrationId', { type: () => ID }) registrationId: string,
  ): Promise<ClubEventGraph> {
    return this.service.adminCancelRegistrationById(
      club.id,
      registrationId,
    ) as Promise<ClubEventGraph>;
  }

  @Mutation(() => EventConvocationResult)
  sendClubEventConvocation(
    @CurrentClub() club: Club,
    @Args('input') input: SendEventConvocationInput,
  ): Promise<EventConvocationResult> {
    return this.service.sendConvocation(club.id, input);
  }
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.EVENTS)
export class EventsViewerResolver {
  constructor(private readonly service: EventsService) {}

  @Query(() => [ClubEventGraph], { name: 'viewerClubEvents' })
  viewerClubEvents(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<ClubEventGraph[]> {
    return this.service.listPublished(club.id, {
      memberId: user.activeProfileMemberId,
      contactId: user.activeProfileContactId,
    }) as Promise<ClubEventGraph[]>;
  }

  @Mutation(() => ClubEventGraph)
  viewerRegisterToEvent(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('eventId', { type: () => ID }) eventId: string,
    @Args('note', { type: () => String, nullable: true }) note: string | null,
  ): Promise<ClubEventGraph> {
    return this.service.register(
      club.id,
      {
        memberId: user.activeProfileMemberId,
        contactId: user.activeProfileContactId,
        userId: user.userId,
      },
      eventId,
      note ?? undefined,
    ) as Promise<ClubEventGraph>;
  }

  @Mutation(() => ClubEventGraph)
  viewerCancelEventRegistration(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('eventId', { type: () => ID }) eventId: string,
  ): Promise<ClubEventGraph> {
    return this.service.cancelRegistration(
      club.id,
      {
        memberId: user.activeProfileMemberId,
        contactId: user.activeProfileContactId,
      },
      eventId,
    ) as Promise<ClubEventGraph>;
  }
}
