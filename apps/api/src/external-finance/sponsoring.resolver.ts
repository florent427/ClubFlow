import { NotFoundException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSponsorshipDealInput } from './dto/create-sponsorship-deal.input';
import { UpdateSponsorshipDealInput } from './dto/update-sponsorship-deal.input';
import { SponsorshipDealGraph } from './models/sponsorship-deal.model';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SPONSORING)
export class SponsoringResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [SponsorshipDealGraph], { name: 'clubSponsorshipDeals' })
  async clubSponsorshipDeals(
    @CurrentClub() club: Club,
  ): Promise<SponsorshipDealGraph[]> {
    const rows = await this.prisma.sponsorshipDeal.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows as SponsorshipDealGraph[];
  }

  @Mutation(() => SponsorshipDealGraph)
  async createClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('input') input: CreateSponsorshipDealInput,
  ): Promise<SponsorshipDealGraph> {
    const r = await this.prisma.sponsorshipDeal.create({
      data: {
        clubId: club.id,
        sponsorName: input.sponsorName,
        amountCents: input.amountCents ?? null,
        notes: input.notes ?? null,
      },
    });
    return r as SponsorshipDealGraph;
  }

  @Mutation(() => SponsorshipDealGraph)
  async updateClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateSponsorshipDealInput,
  ): Promise<SponsorshipDealGraph> {
    const existing = await this.prisma.sponsorshipDeal.findFirst({
      where: { id: input.id, clubId: club.id },
    });
    if (!existing) throw new NotFoundException('Contrat introuvable');
    const r = await this.prisma.sponsorshipDeal.update({
      where: { id: input.id },
      data: {
        ...(input.sponsorName !== undefined && { sponsorName: input.sponsorName }),
        ...(input.amountCents !== undefined && { amountCents: input.amountCents }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });
    return r as SponsorshipDealGraph;
  }

  @Mutation(() => Boolean)
  async deleteClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const existing = await this.prisma.sponsorshipDeal.findFirst({
      where: { id, clubId: club.id },
    });
    if (!existing) throw new NotFoundException('Contrat introuvable');
    await this.prisma.sponsorshipDeal.delete({ where: { id } });
    return true;
  }
}
