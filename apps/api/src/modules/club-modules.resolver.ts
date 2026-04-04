import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { ClubModuleGraph } from './club-modules.model';
import { ClubModulesService } from './club-modules.service';

@Resolver()
export class ClubModulesResolver {
  constructor(
    private readonly clubModulesService: ClubModulesService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => [ClubModuleGraph], { name: 'clubModules' })
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  async listClubModules(@CurrentClub() club: Club): Promise<ClubModuleGraph[]> {
    await this.clubModulesService.ensureFamiliesBundledWithMembers(club.id);
    const rows = await this.prisma.clubModule.findMany({
      where: { clubId: club.id },
    });
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      moduleCode: r.moduleCode as ModuleCode,
      enabled: r.enabled,
    }));
  }

  @Mutation(() => ClubModuleGraph)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
  async setClubModuleEnabled(
    @CurrentClub() club: Club,
    @Args('moduleCode', { type: () => ModuleCode }) moduleCode: ModuleCode,
    @Args('enabled') enabled: boolean,
  ): Promise<ClubModuleGraph> {
    const row = await this.clubModulesService.setClubModuleEnabled(
      club.id,
      moduleCode,
      enabled,
    );
    return {
      id: row.id,
      clubId: row.clubId,
      moduleCode: row.moduleCode as ModuleCode,
      enabled: row.enabled,
    };
  }
}
