import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  userHasClubBackOfficeRole,
  userHasClubStaffRole,
} from '../club-back-office-role';

/**
 * Qui passe une route REST d'un club :
 * - `BACK_OFFICE` : admin, bureau, trésorerie et admins système, comme
 *   `ClubAdminRoleGuard` en GraphQL ;
 * - `STAFF` : toute l'équipe du club, c'est-à-dire tout rôle d'adhésion au club,
 *   et les admins système.
 */
export type ClubRestAccess = 'BACK_OFFICE' | 'STAFF';

const CLUB_REST_ACCESS_KEY = 'clubRestAccess';

/** Ouvre une route à toute l'équipe du club. Sans ce décorateur : le back-office. */
export const RequireClubRestAccess = (access: ClubRestAccess) =>
  SetMetadata(CLUB_REST_ACCESS_KEY, access);

/**
 * Garde des routes REST scopées par l'en-tête `X-Club-Id` : fichiers et exports
 * d'un club.
 *
 * L'en-tête se falsifie, et l'identifiant d'un club est public (`clubBySlug`,
 * `searchPublicClubs`). Filtrer les lectures par ce `clubId` ne protège donc
 * rien : sans cette garde, n'importe quel compte connecté lisait les factures,
 * la comptabilité ou la médiathèque d'un autre club. La garde vérifie que le
 * compte du jeton appartient au club demandé, avec le rôle requis.
 *
 * S'emploie après `AuthGuard('jwt')`, qui pose `req.user` :
 * `@UseGuards(AuthGuard('jwt'), ClubRestAccessGuard)`.
 */
@Injectable()
export class ClubRestAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = (req.user as { userId?: string } | undefined)?.userId;
    if (!userId) {
      throw new ForbiddenException();
    }
    const raw = req.headers['x-club-id'];
    const clubId = Array.isArray(raw) ? raw[0] : raw;
    if (!clubId || typeof clubId !== 'string') {
      throw new BadRequestException('X-Club-Id header requis');
    }
    const access =
      this.reflector.getAllAndOverride<ClubRestAccess | undefined>(
        CLUB_REST_ACCESS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'BACK_OFFICE';
    const allowed =
      access === 'STAFF'
        ? await userHasClubStaffRole(this.prisma, userId, clubId)
        : await userHasClubBackOfficeRole(this.prisma, userId, clubId);
    if (!allowed) {
      throw new ForbiddenException();
    }
    return true;
  }
}
