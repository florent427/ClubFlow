import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { type Club, SystemRole } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import {
  SuperAdminGuard,
  SystemAdminGuard,
} from '../common/guards/system-admin.guard';
import type { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { SystemUserGql } from './models/system-user.model';
import { SystemAdminService } from './system-admin.service';

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class SystemAdminResolver {
  constructor(
    private readonly service: SystemAdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Renvoie le rôle système du viewer courant. Utilisé par l'admin UI
   * pour conditionner l'affichage du panneau d'administration.
   * Pas de guard `SystemAdminGuard` ici : tous les Users authentifiés
   * peuvent appeler cette query (renvoie null s'ils n'ont pas de rôle).
   */
  @Query(() => SystemRole, { name: 'viewerSystemRole', nullable: true })
  async viewerSystemRole(
    @CurrentUser() user: RequestUser,
  ): Promise<SystemRole | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { systemRole: true },
    });
    return u?.systemRole ?? null;
  }

  /**
   * Liste tous les utilisateurs avec un rôle système (ADMIN ou
   * SUPER_ADMIN). Ouvert à tout admin système.
   */
  @Query(() => [SystemUserGql], { name: 'systemAdmins' })
  @UseGuards(SystemAdminGuard)
  async systemAdmins(): Promise<SystemUserGql[]> {
    const rows = await this.service.listSystemUsers();
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      systemRole: u.systemRole,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  }

  /**
   * Promeut un utilisateur lambda en ADMIN. Tout admin système peut le
   * faire.
   */
  @Mutation(() => SystemUserGql, { name: 'systemPromoteToAdmin' })
  @UseGuards(SystemAdminGuard)
  async systemPromoteToAdmin(
    @CurrentUser() user: RequestUser,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<SystemUserGql> {
    const u = await this.service.promoteToAdmin(user.userId, userId);
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      systemRole: u.systemRole,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  /**
   * Retire le rôle ADMIN. Réservé au SUPER_ADMIN (action sur un autre
   * admin).
   */
  @Mutation(() => SystemUserGql, { name: 'systemDemoteAdmin' })
  @UseGuards(SuperAdminGuard)
  async systemDemoteAdmin(
    @CurrentUser() user: RequestUser,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<SystemUserGql> {
    const u = await this.service.demoteAdmin(user.userId, userId);
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      systemRole: u.systemRole,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  /**
   * Supprime un utilisateur. Si la cible est admin, le service refuse
   * sauf si l'acteur est SUPER_ADMIN.
   */
  @Mutation(() => Boolean, { name: 'systemDeleteUser' })
  @UseGuards(SystemAdminGuard)
  async systemDeleteUser(
    @CurrentUser() user: RequestUser,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<boolean> {
    return this.service.deleteUser(user.userId, userId);
  }

  /**
   * Variante "depuis la fiche adhérent" : promeut/dégrade le User lié
   * au membre. Pratique pour l'UI : pas besoin de connaître le UUID
   * du User, on agit directement depuis la liste des membres.
   *
   * `role = ADMIN`  → promotion (tout admin système peut)
   * `role = null`   → retrait du rôle ADMIN (réservé SUPER_ADMIN)
   */
  @Mutation(() => Boolean, { name: 'systemSetMemberAdminRole' })
  @UseGuards(ClubContextGuard, SystemAdminGuard)
  async systemSetMemberAdminRole(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('role', { type: () => SystemRole, nullable: true })
    role: SystemRole | null,
  ): Promise<boolean> {
    await this.service.setMemberSystemRole(
      user.userId,
      club.id,
      memberId,
      role,
    );
    return true;
  }
}
