import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGrantApplicationInput } from './dto/create-grant-application.input';
import { GrantApplicationGraph } from './models/grant-application.model';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SUBSIDIES)
export class SubsidiesResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [GrantApplicationGraph], { name: 'clubGrantApplications' })
  async clubGrantApplications(
    @CurrentClub() club: Club,
  ): Promise<GrantApplicationGraph[]> {
    const rows = await this.prisma.grantApplication.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      amountCents: r.amountCents,
    }));
  }

  @Mutation(() => GrantApplicationGraph)
  async createClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('input') input: CreateGrantApplicationInput,
  ): Promise<GrantApplicationGraph> {
    const r = await this.prisma.grantApplication.create({
      data: {
        clubId: club.id,
        title: input.title,
        amountCents: input.amountCents ?? null,
      },
    });
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      amountCents: r.amountCents,
    };
  }
}
