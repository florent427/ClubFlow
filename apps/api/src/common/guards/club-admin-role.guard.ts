import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { userHasClubBackOfficeRole } from '../club-back-office-role';
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
    const ok = await userHasClubBackOfficeRole(this.prisma, userId, clubId);
    if (!ok) {
      throw new ForbiddenException();
    }
    return true;
  }
}
