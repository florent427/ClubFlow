import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ClubGraphModel } from './models/club.model';
import { ClubMembershipGraphModel } from './models/club-membership.model';
import { UpdateClubBrandingInput } from './dto/update-club-branding.input';

function toClubGraph(row: {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  siret?: string | null;
  address?: string | null;
  legalMentions?: string | null;
}): ClubGraphModel {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl ?? null,
    siret: row.siret ?? null,
    address: row.address ?? null,
    legalMentions: row.legalMentions ?? null,
  };
}

@Resolver()
export class ClubsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => ClubGraphModel)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  async club(@CurrentClub() club: Club): Promise<ClubGraphModel> {
    // club from @CurrentClub ne contient que les champs du middleware;
    // on relit pour s'assurer d'avoir les champs ajoutés récemment (logoUrl…).
    const fresh = await this.prisma.club.findUnique({ where: { id: club.id } });
    return toClubGraph(fresh ?? club);
  }

  @Query(() => ClubMembershipGraphModel, { nullable: true })
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  async myMembership(
    @CurrentUser() user: RequestUser | undefined,
    @CurrentClub() club: Club,
  ): Promise<ClubMembershipGraphModel | null> {
    if (!user?.userId) {
      return null;
    }
    const row = await this.prisma.clubMembership.findUnique({
      where: {
        userId_clubId: { userId: user.userId, clubId: club.id },
      },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      userId: row.userId,
      clubId: row.clubId,
      role: row.role,
    };
  }

  @Mutation(() => ClubGraphModel)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
  async updateClubBranding(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubBrandingInput,
  ): Promise<ClubGraphModel> {
    if (!club?.id) {
      throw new ForbiddenException('Club introuvable.');
    }
    const data: Record<string, unknown> = {};
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
    if (input.siret !== undefined) data.siret = input.siret;
    if (input.address !== undefined) data.address = input.address;
    if (input.legalMentions !== undefined)
      data.legalMentions = input.legalMentions;
    const updated = await this.prisma.club.update({
      where: { id: club.id },
      data,
    });
    return toClubGraph(updated);
  }
}
