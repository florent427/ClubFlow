import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { MembershipRole, SystemRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Autorise les utilisateurs ayant un rôle éditorial (CLUB_ADMIN, BOARD,
 * TREASURER, COMM_MANAGER) sur le club courant. Utilisé à la place de
 * `ClubAdminRoleGuard` pour les mutations de contenu vitrine qu'on veut
 * pouvoir déléguer à un responsable communication.
 *
 * Les **administrateurs système** (`SystemRole.ADMIN` / `SUPER_ADMIN`) ont
 * accès à tous les clubs sans `ClubMembership` explicite — cohérent avec
 * `userHasClubBackOfficeRole` côté `ClubAdminRoleGuard`.
 *
 * NB : `COMM_MANAGER` ne confère **aucun** droit sur la facturation ou les
 * paramètres financiers — les guards plus restrictifs (ex. `TreasurerRoleGuard`
 * si introduit ensuite) continuent d'appliquer leurs règles.
 */
const ALLOWED: readonly MembershipRole[] = [
  MembershipRole.CLUB_ADMIN,
  MembershipRole.BOARD,
  MembershipRole.TREASURER,
  MembershipRole.COMM_MANAGER,
];

@Injectable()
export class ClubCommManagerRoleGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    const clubId = req.club?.id;
    if (!userId || !clubId) {
      throw new ForbiddenException();
    }
    // System admins traversent tous les clubs.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systemRole: true },
    });
    if (
      user?.systemRole === SystemRole.SUPER_ADMIN ||
      user?.systemRole === SystemRole.ADMIN
    ) {
      return true;
    }
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership || !ALLOWED.includes(membership.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
