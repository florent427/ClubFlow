import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ClubTeamService } from './club-team.service';
import { InviteClubTeamMemberInput } from './dto/invite-club-team-member.input';
import { SetClubTeamMemberRoleInput } from './dto/set-club-team-member-role.input';
import { ClubTeamMemberGraph } from './models/club-team-member.model';

/**
 * Écran « Équipe » : gestion des accès à l'espace d'administration du club.
 *
 * Les trois gardes sont posées SUR LA CLASSE. Les déplacer sur une méthode,
 * ou les oublier sur une nouvelle, ferait perdre le contrôle de rôle
 * SILENCIEUSEMENT — la mutation continuerait de répondre 200.
 *
 * `ClubAdminRoleGuard` autorise ADMIN / BUREAU / TRÉSORERIE ; les ÉCRITURES
 * sont resserrées à l'administrateur du club dans `ClubTeamService`.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
export class ClubTeamResolver {
  constructor(private readonly team: ClubTeamService) {}

  @Query(() => [ClubTeamMemberGraph], { name: 'clubTeamMembers' })
  clubTeamMembers(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<ClubTeamMemberGraph[]> {
    return this.team.list(club.id, user.userId);
  }

  @Mutation(() => ClubTeamMemberGraph)
  inviteClubTeamMember(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: InviteClubTeamMemberInput,
  ): Promise<ClubTeamMemberGraph> {
    return this.team.invite(club.id, user.userId, input);
  }

  @Mutation(() => Boolean)
  async setClubTeamMemberRole(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetClubTeamMemberRoleInput,
  ): Promise<boolean> {
    await this.team.setRole(club.id, user.userId, input);
    return true;
  }

  @Mutation(() => Boolean)
  async removeClubTeamMember(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('membershipId', { type: () => ID }) membershipId: string,
  ): Promise<boolean> {
    await this.team.remove(club.id, user.userId, membershipId);
    return true;
  }
}
