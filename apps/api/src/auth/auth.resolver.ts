import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import type { RequestUser } from '../common/types/request-user';
import { ViewerProfileGraph } from '../families/models/viewer-profile.model';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { RegisterContactInput } from './dto/register-contact.input';
import { ResendVerificationInput } from './dto/resend-verification.input';
import { VerifyEmailInput } from './dto/verify-email.input';
import { LoginPayload } from './models/login-payload.model';
import { RegisterContactResult } from './models/register-contact-result.model';
import { ResendVerificationResult } from './models/resend-verification-result.model';
import { ViewerAdminSwitchGraph } from './models/viewer-admin-switch.model';

@Resolver()
@UseGuards(GqlThrottlerGuard)
export class AuthResolver {
  constructor(private readonly auth: AuthService) {}

  @Mutation(() => LoginPayload)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  login(@Args('input') input: LoginInput): Promise<LoginPayload> {
    return this.auth.login(input);
  }

  @Mutation(() => RegisterContactResult)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  registerContact(
    @Args('input') input: RegisterContactInput,
  ): Promise<RegisterContactResult> {
    return this.auth.registerContact(input);
  }

  @Mutation(() => LoginPayload)
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  verifyEmail(@Args('input') input: VerifyEmailInput): Promise<LoginPayload> {
    return this.auth.verifyEmail(input.token);
  }

  @Mutation(() => ResendVerificationResult)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  resendVerificationEmail(
    @Args('input') input: ResendVerificationInput,
  ): Promise<ResendVerificationResult> {
    return this.auth.resendVerificationEmail(input.email);
  }

  @Query(() => [ViewerProfileGraph])
  @SkipThrottle()
  @UseGuards(GqlJwtAuthGuard)
  viewerProfiles(
    @CurrentUser() user: RequestUser,
  ): Promise<ViewerProfileGraph[]> {
    return this.auth.viewerProfilesForUser(user.userId);
  }

  @Query(() => ViewerAdminSwitchGraph, { name: 'viewerAdminSwitch' })
  @SkipThrottle()
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  viewerAdminSwitch(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerAdminSwitchGraph> {
    return this.auth.viewerAdminSwitch(user.userId, club.id);
  }

  @Mutation(() => LoginPayload)
  @SkipThrottle()
  @UseGuards(GqlJwtAuthGuard)
  selectActiveViewerProfile(
    @CurrentUser() user: RequestUser,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<LoginPayload> {
    return this.auth.selectActiveProfile(user.userId, memberId);
  }

  @Mutation(() => LoginPayload)
  @SkipThrottle()
  @UseGuards(GqlJwtAuthGuard)
  selectActiveViewerContactProfile(
    @CurrentUser() user: RequestUser,
    @Args('contactId', { type: () => ID }) contactId: string,
  ): Promise<LoginPayload> {
    return this.auth.selectActiveContactProfile(user.userId, contactId);
  }
}
