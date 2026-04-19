import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
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
import { ViewerJoinFamilyByPayerEmailInput } from './dto/viewer-join-family-by-payer-email.input';
import { ViewerUpdateMyPseudoInput } from './dto/viewer-update-my-pseudo.input';
import { ViewerCourseSlotGraph } from './models/viewer-course-slot.model';
import { ViewerFamilyBillingSummaryGraph } from './models/viewer-family-billing.model';
import { ViewerFamilyJoinResultGraph } from './models/viewer-family-join-result.model';
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
    if (user.activeProfileMemberId) {
      return this.viewer.viewerMe(
        club.id,
        user.activeProfileMemberId,
        user.userId,
      );
    }
    if (user.activeProfileContactId) {
      return this.viewer.viewerMeAsContact(
        club.id,
        user.activeProfileContactId,
        user.userId,
      );
    }
    throw new BadRequestException('Sélection de profil requise');
  }

  @Query(() => [ViewerCourseSlotGraph], { name: 'viewerUpcomingCourseSlots' })
  @RequireClubModule(ModuleCode.PLANNING)
  viewerUpcomingCourseSlots(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerCourseSlotGraph[]> {
    if (user.activeProfileContactId || !user.activeProfileMemberId) {
      return Promise.resolve([]);
    }
    return this.viewer.viewerUpcomingCourseSlots(
      club.id,
      user.activeProfileMemberId,
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
    if (user.activeProfileMemberId) {
      return this.viewer.viewerFamilyBillingSummary(
        club.id,
        user.activeProfileMemberId,
        user.userId,
      );
    }
    if (user.activeProfileContactId) {
      return this.viewer.viewerFamilyBillingSummaryForContact(
        club.id,
        user.activeProfileContactId,
        user.userId,
      );
    }
    throw new BadRequestException('Sélection de profil requise');
  }

  @Mutation(() => ViewerFamilyJoinResultGraph, {
    name: 'viewerJoinFamilyByPayerEmail',
    description:
      'Rattache le profil actif (fiche adhérent ou contact) à un foyer existant en saisissant l’e-mail du payeur (ou du membre seul du foyer).',
  })
  @RequireClubModule(ModuleCode.FAMILIES)
  viewerJoinFamilyByPayerEmail(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerJoinFamilyByPayerEmailInput,
  ): Promise<ViewerFamilyJoinResultGraph> {
    if (user.activeProfileMemberId) {
      return this.viewer.viewerJoinFamilyByPayerEmail(
        club.id,
        user.activeProfileMemberId,
        input.payerEmail,
      );
    }
    if (user.activeProfileContactId) {
      return this.viewer.contactJoinFamilyByPayerEmail(
        club.id,
        user.activeProfileContactId,
        user.userId,
        input.payerEmail,
      );
    }
    throw new BadRequestException('Sélection de profil requise');
  }

  @Mutation(() => ViewerMemberGraph, { name: 'viewerUpdateMyPseudo' })
  @RequireClubModule(ModuleCode.MESSAGING)
  viewerUpdateMyPseudo(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ViewerUpdateMyPseudoInput,
  ): Promise<ViewerMemberGraph> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException(
        'Cette action nécessite une fiche adhérent active.',
      );
    }
    return this.viewer.updateMyPseudo(
      club.id,
      user.activeProfileMemberId,
      user.userId,
      input.pseudo,
    );
  }
}
