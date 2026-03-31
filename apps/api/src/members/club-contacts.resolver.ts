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
import { ClubContactsService } from './club-contacts.service';
import { UpdateClubContactInput } from './dto/update-club-contact.input';
import { ClubContactGraph } from './models/club-contact.model';
import { PromoteContactResultGraph } from './models/promote-contact-result.model';

function toGraph(r: Awaited<ReturnType<ClubContactsService['getClubContact']>>): ClubContactGraph {
  return {
    id: r.id,
    clubId: r.clubId,
    userId: r.userId,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    emailVerified: r.emailVerified,
    linkedMemberId: r.linkedMemberId,
    canDeleteContact: r.canDeleteContact,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.MEMBERS)
export class ClubContactsResolver {
  constructor(private readonly clubContactsService: ClubContactsService) {}

  @Query(() => [ClubContactGraph], { name: 'clubContacts' })
  async clubContacts(@CurrentClub() club: Club): Promise<ClubContactGraph[]> {
    const rows = await this.clubContactsService.listClubContacts(club.id);
    return rows.map(toGraph);
  }

  @Query(() => ClubContactGraph, { name: 'clubContact' })
  async clubContact(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubContactGraph> {
    const row = await this.clubContactsService.getClubContact(club.id, id);
    return toGraph(row);
  }

  @Mutation(() => ClubContactGraph)
  async updateClubContact(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubContactInput,
  ): Promise<ClubContactGraph> {
    const row = await this.clubContactsService.updateClubContact(
      club.id,
      input.id,
      {
        firstName: input.firstName,
        lastName: input.lastName,
      },
    );
    return toGraph(row);
  }

  @Mutation(() => Boolean)
  async deleteClubContact(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.clubContactsService.deleteClubContact(club.id, id);
    return true;
  }

  @Mutation(() => PromoteContactResultGraph)
  async promoteContactToMember(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PromoteContactResultGraph> {
    return this.clubContactsService.promoteContactToMember(club.id, id);
  }
}
