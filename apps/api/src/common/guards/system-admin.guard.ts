import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Garde pour les actions d'administration **système** (transverses aux
 * clubs) : gestion globale des utilisateurs, rôles système, etc.
 *
 * Autorise les Users avec `systemRole IN [ADMIN, SUPER_ADMIN]`.
 * Les actions destructives sur d'autres administrateurs nécessitent en
 * plus le `SuperAdminGuard`.
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    if (!userId) {
      throw new ForbiddenException();
    }
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systemRole: true },
    });
    if (!u?.systemRole) {
      throw new ForbiddenException(
        'Réservé aux administrateurs système.',
      );
    }
    if (
      u.systemRole !== SystemRole.ADMIN &&
      u.systemRole !== SystemRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}

/**
 * Garde plus stricte : réservée au compte super-administrateur (SaaS).
 * Utilisée pour les actions touchant à un autre administrateur :
 * promotion ADMIN → SUPER_ADMIN, suppression d'un User ayant un
 * systemRole, dégradation d'un admin.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const req = gqlContext.getContext().req as Request;
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    if (!userId) {
      throw new ForbiddenException();
    }
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { systemRole: true },
    });
    if (u?.systemRole !== SystemRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Réservé au super administrateur.',
      );
    }
    return true;
  }
}
