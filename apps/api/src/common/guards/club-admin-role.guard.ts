import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Back-office sensible : admin club, bureau, trésorerie (facturation, adhésion, etc.).
 */
@Injectable()
export class ClubAdminRoleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    const clubId = req.club?.id;
    if (!userId || !clubId) {
      throw new ForbiddenException();
    }
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new ForbiddenException();
    }
    if (
      membership.role !== MembershipRole.CLUB_ADMIN &&
      membership.role !== MembershipRole.BOARD &&
      membership.role !== MembershipRole.TREASURER
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
