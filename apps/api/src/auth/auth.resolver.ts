import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ViewerProfileGraph } from '../families/models/viewer-profile.model';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { LoginPayload } from './models/login-payload.model';
import { ViewerAdminSwitchGraph } from './models/viewer-admin-switch.model';

@Resolver()
export class AuthResolver {
  constructor(private readonly auth: AuthService) {}

  @Mutation(() => LoginPayload)
  login(@Args('input') input: LoginInput): Promise<LoginPayload> {
    return this.auth.login(input);
  }

  @Query(() => [ViewerProfileGraph])
  @UseGuards(GqlJwtAuthGuard)
  viewerProfiles(
    @CurrentUser() user: RequestUser,
  ): Promise<ViewerProfileGraph[]> {
    return this.auth.viewerProfilesForUser(user.userId);
  }

  @Query(() => ViewerAdminSwitchGraph, { name: 'viewerAdminSwitch' })
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  viewerAdminSwitch(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerAdminSwitchGraph> {
    return this.auth.viewerAdminSwitch(user.userId, club.id);
  }

  @Mutation(() => LoginPayload)
  @UseGuards(GqlJwtAuthGuard)
  selectActiveViewerProfile(
    @CurrentUser() user: RequestUser,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<LoginPayload> {
    return this.auth.selectActiveProfile(user.userId, memberId);
  }
}
