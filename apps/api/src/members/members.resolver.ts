import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { MemberStatus } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CreateClubRoleDefinitionInput } from './dto/create-club-role-definition.input';
import { CreateDynamicGroupInput } from './dto/create-dynamic-group.input';
import { CreateGradeLevelInput } from './dto/create-grade-level.input';
import { CreateMemberCustomFieldDefinitionInput } from './dto/create-member-custom-field-definition.input';
import { CreateMemberInput } from './dto/create-member.input';
import { UpsertClubMemberCatalogFieldSettingInput } from './dto/upsert-club-member-catalog-field-settings.input';
import { UpdateClubRoleDefinitionInput } from './dto/update-club-role-definition.input';
import { UpdateDynamicGroupInput } from './dto/update-dynamic-group.input';
import { UpdateGradeLevelInput } from './dto/update-grade-level.input';
import { UpdateMemberCustomFieldDefinitionInput } from './dto/update-member-custom-field-definition.input';
import { SetMemberDynamicGroupsInput } from './dto/set-member-dynamic-groups.input';
import { UpdateMemberInput } from './dto/update-member.input';
import { ClubMemberFieldLayoutGraph } from './models/club-member-field-layout.model';
import { ClubRoleDefinitionGraph } from './models/club-role-definition.model';
import { DynamicGroupGraph } from './models/dynamic-group.model';
import { GradeLevelGraph } from './models/grade-level.model';
import { MemberCatalogFieldSettingGraph } from './models/member-catalog-field-setting.model';
import { MemberCustomFieldDefinitionGraph } from './models/member-custom-field-definition.model';
import { MemberGraph } from './models/member.model';
import { MemberFieldConfigService } from './member-field-config.service';
import { MembersService } from './members.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.MEMBERS)
export class MembersResolver {
  constructor(
    private readonly members: MembersService,
    private readonly memberFieldConfig: MemberFieldConfigService,
  ) {}

  @Query(() => ClubMemberFieldLayoutGraph, { name: 'clubMemberFieldLayout' })
  clubMemberFieldLayout(
    @CurrentClub() club: Club,
  ): Promise<ClubMemberFieldLayoutGraph> {
    return this.members.getMemberFieldLayout(club.id);
  }

  @Mutation(() => [MemberCatalogFieldSettingGraph])
  upsertClubMemberCatalogFieldSettings(
    @CurrentClub() club: Club,
    @Args('items', { type: () => [UpsertClubMemberCatalogFieldSettingInput] })
    items: UpsertClubMemberCatalogFieldSettingInput[],
  ): Promise<MemberCatalogFieldSettingGraph[]> {
    return this.memberFieldConfig.upsertCatalogSettings(club.id, items);
  }

  @Mutation(() => MemberCustomFieldDefinitionGraph)
  createMemberCustomFieldDefinition(
    @CurrentClub() club: Club,
    @Args('input') input: CreateMemberCustomFieldDefinitionInput,
  ): Promise<MemberCustomFieldDefinitionGraph> {
    return this.memberFieldConfig.createCustomDefinition(club.id, input);
  }

  @Mutation(() => MemberCustomFieldDefinitionGraph)
  updateMemberCustomFieldDefinition(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMemberCustomFieldDefinitionInput,
  ): Promise<MemberCustomFieldDefinitionGraph> {
    return this.memberFieldConfig.updateCustomDefinition(club.id, input);
  }

  @Mutation(() => MemberCustomFieldDefinitionGraph)
  archiveMemberCustomFieldDefinition(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MemberCustomFieldDefinitionGraph> {
    return this.memberFieldConfig.archiveCustomDefinition(club.id, id);
  }

  @Query(() => [GradeLevelGraph], { name: 'clubGradeLevels' })
  clubGradeLevels(@CurrentClub() club: Club): Promise<GradeLevelGraph[]> {
    return this.members.listGradeLevels(club.id);
  }

  @Mutation(() => GradeLevelGraph)
  createClubGradeLevel(
    @CurrentClub() club: Club,
    @Args('input') input: CreateGradeLevelInput,
  ): Promise<GradeLevelGraph> {
    return this.members.createGradeLevel(club.id, input);
  }

  @Mutation(() => GradeLevelGraph)
  updateClubGradeLevel(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateGradeLevelInput,
  ): Promise<GradeLevelGraph> {
    return this.members.updateGradeLevel(club.id, input);
  }

  @Mutation(() => Boolean)
  async deleteClubGradeLevel(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.members.deleteGradeLevel(club.id, id);
    return true;
  }

  @Query(() => [ClubRoleDefinitionGraph], { name: 'clubRoleDefinitions' })
  clubRoleDefinitions(
    @CurrentClub() club: Club,
  ): Promise<ClubRoleDefinitionGraph[]> {
    return this.members.listClubRoleDefinitions(club.id);
  }

  @Mutation(() => ClubRoleDefinitionGraph)
  createClubRoleDefinition(
    @CurrentClub() club: Club,
    @Args('input') input: CreateClubRoleDefinitionInput,
  ): Promise<ClubRoleDefinitionGraph> {
    return this.members.createClubRoleDefinition(club.id, input);
  }

  @Mutation(() => ClubRoleDefinitionGraph)
  updateClubRoleDefinition(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubRoleDefinitionInput,
  ): Promise<ClubRoleDefinitionGraph> {
    return this.members.updateClubRoleDefinition(club.id, input);
  }

  @Mutation(() => Boolean)
  async deleteClubRoleDefinition(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.members.deleteClubRoleDefinition(club.id, id);
    return true;
  }

  @Query(() => [MemberGraph], { name: 'clubMembers' })
  clubMembers(@CurrentClub() club: Club): Promise<MemberGraph[]> {
    return this.members.listMembers(club.id);
  }

  @Query(() => MemberGraph, { name: 'clubMember' })
  clubMember(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MemberGraph> {
    return this.members.getMember(club.id, id);
  }

  @Mutation(() => MemberGraph)
  createClubMember(
    @CurrentClub() club: Club,
    @Args('input') input: CreateMemberInput,
  ): Promise<MemberGraph> {
    return this.members.createMember(club.id, input);
  }

  @Mutation(() => MemberGraph)
  updateClubMember(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMemberInput,
  ): Promise<MemberGraph> {
    return this.members.updateMember(club.id, input);
  }

  @Mutation(() => Boolean)
  async deleteClubMember(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.members.deleteMember(club.id, id);
    return true;
  }

  @Mutation(() => MemberGraph)
  setClubMemberStatus(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('status', { type: () => MemberStatus }) status: MemberStatus,
  ): Promise<MemberGraph> {
    return this.members.setMemberStatus(club.id, id, status);
  }

  @Query(() => [DynamicGroupGraph], { name: 'clubDynamicGroups' })
  clubDynamicGroups(@CurrentClub() club: Club): Promise<DynamicGroupGraph[]> {
    return this.members.listDynamicGroups(club.id);
  }

  @Query(() => [DynamicGroupGraph], {
    name: 'suggestMemberDynamicGroups',
    description:
      'Groupes dont les critères correspondent à l’âge et au grade du membre (tri par spécificité).',
  })
  suggestMemberDynamicGroups(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<DynamicGroupGraph[]> {
    return this.members.suggestDynamicGroupsForMember(club.id, memberId);
  }

  @Mutation(() => Boolean)
  async setMemberDynamicGroups(
    @CurrentClub() club: Club,
    @Args('input') input: SetMemberDynamicGroupsInput,
  ): Promise<boolean> {
    await this.members.setMemberDynamicGroupAssignments(
      club.id,
      input.memberId,
      input.dynamicGroupIds,
    );
    return true;
  }

  @Mutation(() => DynamicGroupGraph)
  createClubDynamicGroup(
    @CurrentClub() club: Club,
    @Args('input') input: CreateDynamicGroupInput,
  ): Promise<DynamicGroupGraph> {
    return this.members.createDynamicGroup(club.id, input);
  }

  @Mutation(() => DynamicGroupGraph)
  updateClubDynamicGroup(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateDynamicGroupInput,
  ): Promise<DynamicGroupGraph> {
    return this.members.updateDynamicGroup(club.id, input);
  }

  @Mutation(() => Boolean)
  async deleteClubDynamicGroup(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.members.deleteDynamicGroup(club.id, id);
    return true;
  }
}
