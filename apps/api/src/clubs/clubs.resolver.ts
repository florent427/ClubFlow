import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ClubGraphModel } from './models/club.model';
import { ClubMembershipGraphModel } from './models/club-membership.model';

@Resolver()
export class ClubsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => ClubGraphModel)
  @UseGuards(GqlJwtAuthGuard, ClubContextGuard)
  club(@CurrentClub() club: Club): ClubGraphModel {
    return { id: club.id, name: club.name, slug: club.slug };
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
}
