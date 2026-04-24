import { NotFoundException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { GrantApplicationStatus } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGrantApplicationInput } from './dto/create-grant-application.input';
import { UpdateGrantApplicationInput } from './dto/update-grant-application.input';
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
    return rows as GrantApplicationGraph[];
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
        notes: input.notes ?? null,
      },
    });
    return r as GrantApplicationGraph;
  }

  @Mutation(() => GrantApplicationGraph)
  async updateClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateGrantApplicationInput,
  ): Promise<GrantApplicationGraph> {
    const existing = await this.prisma.grantApplication.findFirst({
      where: { id: input.id, clubId: club.id },
    });
    if (!existing) throw new NotFoundException('Dossier introuvable');
    const r = await this.prisma.grantApplication.update({
      where: { id: input.id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.amountCents !== undefined && { amountCents: input.amountCents }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });
    return r as GrantApplicationGraph;
  }

  @Mutation(() => GrantApplicationGraph)
  async submitClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    const existing = await this.prisma.grantApplication.findFirst({
      where: { id, clubId: club.id },
    });
    if (!existing) throw new NotFoundException('Dossier introuvable');
    const r = await this.prisma.grantApplication.update({
      where: { id },
      data: { status: GrantApplicationStatus.REQUESTED },
    });
    return r as GrantApplicationGraph;
  }

  @Mutation(() => GrantApplicationGraph)
  async archiveClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    const existing = await this.prisma.grantApplication.findFirst({
      where: { id, clubId: club.id },
    });
    if (!existing) throw new NotFoundException('Dossier introuvable');
    const r = await this.prisma.grantApplication.update({
      where: { id },
      data: { status: GrantApplicationStatus.ARCHIVED },
    });
    return r as GrantApplicationGraph;
  }

  @Mutation(() => Boolean)
  async deleteClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const existing = await this.prisma.grantApplication.findFirst({
      where: { id, clubId: club.id },
    });
    if (!existing) throw new NotFoundException('Dossier introuvable');
    await this.prisma.grantApplication.delete({ where: { id } });
    return true;
  }
}
