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
 * Rôles autorisés à créer / administrer un ClubProject.
 *
 * `PROJECT_MANAGER` est un rôle dédié qui permet à un membre non-admin
 * de piloter des projets sans avoir les droits financiers / membres
 * complets. CLUB_ADMIN et BOARD disposent des mêmes droits sur les projets
 * en sus de leurs prérogatives habituelles.
 */
export const PROJECT_ADMIN_ROLES: readonly MembershipRole[] = [
  MembershipRole.CLUB_ADMIN,
  MembershipRole.BOARD,
  MembershipRole.PROJECT_MANAGER,
];

/**
 * Guard GraphQL : autorise l'accès aux mutations d'administration de
 * projets (création, modification, phases LIVE, validation items,
 * génération comptes-rendus…). Les mutations accessibles aux
 * contributeurs (upload LIVE, etc.) ne passent PAS par ce guard — elles
 * vérifient l'appartenance au projet via `ProjectContributorService.
 * isActiveContributor()` directement dans le resolver.
 */
@Injectable()
export class ClubProjectAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gql = GqlExecutionContext.create(context);
    const req = gql.getContext().req as Request;
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    const clubId = req.club?.id;
    if (!userId || !clubId) throw new ForbiddenException();

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership || !PROJECT_ADMIN_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        "Rôle requis : CLUB_ADMIN, BOARD ou PROJECT_MANAGER.",
      );
    }
    return true;
  }
}
