import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { FamilyMemberLinkRole } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CreateHouseholdGroupInput } from './dto/create-household-group.input';
import { CreateClubFamilyInput } from './dto/create-club-family.input';
import { SetFamilyHouseholdGroupInput } from './dto/set-family-household-group.input';
import { SetHouseholdGroupCarrierInput } from './dto/set-household-group-carrier.input';
import { UpdateClubFamilyInput } from './dto/update-club-family.input';
import { FamiliesService } from './families.service';
import { FamilyGraph } from './models/family-graph.model';
import { HouseholdGroupGraph } from './models/household-group-graph.model';

@Resolver()
export class FamiliesResolver {
  constructor(private readonly families: FamiliesService) {}

  @Query(() => [FamilyGraph], { name: 'clubFamilies' })
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  clubFamilies(@CurrentClub() club: Club): Promise<FamilyGraph[]> {
    return this.families.listClubFamilies(club.id);
  }

  @Query(() => [HouseholdGroupGraph], { name: 'clubHouseholdGroups' })
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  clubHouseholdGroups(
    @CurrentClub() club: Club,
  ): Promise<HouseholdGroupGraph[]> {
    return this.families.listClubHouseholdGroups(club.id);
  }

  @Mutation(() => HouseholdGroupGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  createHouseholdGroup(
    @CurrentClub() club: Club,
    @Args('input') input: CreateHouseholdGroupInput,
  ): Promise<HouseholdGroupGraph> {
    return this.families.createHouseholdGroup(club.id, input);
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  setFamilyHouseholdGroup(
    @CurrentClub() club: Club,
    @Args('input') input: SetFamilyHouseholdGroupInput,
  ): Promise<FamilyGraph> {
    return this.families.setFamilyHouseholdGroup(club.id, input);
  }

  @Mutation(() => HouseholdGroupGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  setHouseholdGroupCarrierFamily(
    @CurrentClub() club: Club,
    @Args('input') input: SetHouseholdGroupCarrierInput,
  ): Promise<HouseholdGroupGraph> {
    return this.families.setHouseholdGroupCarrierFamily(club.id, input);
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  createClubFamily(
    @CurrentClub() club: Club,
    @Args('input') input: CreateClubFamilyInput,
  ): Promise<FamilyGraph> {
    return this.families.createClubFamily(club.id, input);
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  updateClubFamily(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubFamilyInput,
  ): Promise<FamilyGraph> {
    return this.families.updateClubFamily(club.id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  async deleteClubFamily(
    @CurrentClub() club: Club,
    @Args('familyId', { type: () => ID }) familyId: string,
  ): Promise<boolean> {
    await this.families.deleteClubFamily(club.id, familyId);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  removeClubMemberFromFamily(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<boolean> {
    return this.families.removeClubMemberFromFamily(club.id, memberId);
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  transferClubMemberToFamily(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('familyId', { type: () => ID }) familyId: string,
    @Args('linkRole', { type: () => FamilyMemberLinkRole })
    linkRole: FamilyMemberLinkRole,
  ): Promise<FamilyGraph> {
    return this.families.transferClubMemberToFamily(
      club.id,
      memberId,
      familyId,
      linkRole,
    );
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  setClubFamilyPayer(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<FamilyGraph> {
    return this.families.setClubFamilyPayer(club.id, memberId);
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  removeClubFamilyLink(
    @CurrentClub() club: Club,
    @Args('linkId', { type: () => ID }) linkId: string,
  ): Promise<FamilyGraph> {
    return this.families.removeClubFamilyLink(club.id, linkId);
  }

  @Mutation(() => FamilyGraph)
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  setClubFamilyPayerContact(
    @CurrentClub() club: Club,
    @Args('familyId', { type: () => ID }) familyId: string,
    @Args('contactId', { type: () => ID }) contactId: string,
  ): Promise<FamilyGraph> {
    return this.families.setClubFamilyPayerContact(
      club.id,
      familyId,
      contactId,
    );
  }

  @Mutation(() => FamilyGraph, {
    description:
      'Rattache (admin) un contact à un foyer en tant que membre observateur (linkRole MEMBER).',
  })
  @UseGuards(
    GqlJwtAuthGuard,
    ClubContextGuard,
    ClubAdminRoleGuard,
    ClubModuleEnabledGuard,
  )
  @RequireClubModule(ModuleCode.FAMILIES)
  attachClubContactToFamilyAsMember(
    @CurrentClub() club: Club,
    @Args('familyId', { type: () => ID }) familyId: string,
    @Args('contactId', { type: () => ID }) contactId: string,
  ): Promise<FamilyGraph> {
    return this.families.adminAttachContactToFamilyAsMember(
      club.id,
      familyId,
      contactId,
    );
  }
}
