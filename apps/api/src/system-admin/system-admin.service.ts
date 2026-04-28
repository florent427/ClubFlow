import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gestion des rôles système globaux (transverses aux clubs) :
 * promotion / dégradation / suppression d'utilisateurs avec le rôle
 * SystemRole.ADMIN ou SUPER_ADMIN.
 *
 * Règles métier :
 * - SUPER_ADMIN est unique (le compte racine, typiquement
 *   `admin@clubflow.local`). Le seed le pose ; cette classe ne le
 *   change pas.
 * - ADMIN peut être créé/retiré uniquement par un SUPER_ADMIN.
 * - ADMIN peut promouvoir un User lambda en ADMIN, mais ne peut pas
 *   toucher à un autre ADMIN ou au SUPER_ADMIN.
 * - Personne (pas même SUPER_ADMIN) ne peut se dégrader soi-même.
 */
@Injectable()
export class SystemAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Promeut ou rétrograde le `User` lié à un `Member` (du club courant).
   * Pratique pour l'UI "fiche adhérent" : on agit sur l'identité réelle
   * (User) sans avoir à connaître son UUID de toutes pièces.
   *
   * Règles :
   * - Le membre doit avoir un `userId` (compte créé). Sinon erreur claire.
   * - role=ADMIN : tout admin système peut promouvoir un user lambda.
   * - role=null  : retirer le rôle ADMIN → réservé SUPER_ADMIN.
   * - On ne touche jamais à un SUPER_ADMIN, et personne ne se modifie soi.
   */
  async setMemberSystemRole(
    actorUserId: string,
    clubId: string,
    memberId: string,
    role: SystemRole | null,
  ) {
    if (role !== null && role !== SystemRole.ADMIN) {
      // SUPER_ADMIN n'est jamais octroyé via cette API.
      throw new BadRequestException(
        'Seuls les rôles ADMIN ou « aucun » sont configurables ici.',
      );
    }
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: { id: true, userId: true },
    });
    if (!member) {
      throw new NotFoundException('Adhérent introuvable.');
    }
    if (!member.userId) {
      throw new BadRequestException(
        "Ce membre n'a pas encore de compte utilisateur. Demandez-lui de créer son compte (ou changez son e-mail dans la fiche pour déclencher l'invitation) avant de lui attribuer un rôle système.",
      );
    }
    if (member.userId === actorUserId) {
      throw new BadRequestException(
        'Vous ne pouvez pas modifier votre propre rôle système ici.',
      );
    }
    // Délègue aux méthodes existantes pour réutiliser leur logique de
    // permission (assertSystemAdmin / assertSuperAdmin) et leurs
    // garde-fous (refuser de toucher au SUPER_ADMIN, etc.).
    if (role === SystemRole.ADMIN) {
      await this.promoteToAdmin(actorUserId, member.userId);
    } else {
      await this.demoteAdmin(actorUserId, member.userId);
    }
    return { id: member.id };
  }

  async listSystemUsers() {
    return this.prisma.user.findMany({
      where: { systemRole: { not: null } },
      orderBy: [{ systemRole: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        systemRole: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Promeut un utilisateur lambda en ADMIN. Refuse si l'utilisateur
   * a déjà un systemRole.
   */
  async promoteToAdmin(actorUserId: string, targetUserId: string) {
    await this.assertActorIsSystemAdmin(actorUserId);
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, systemRole: true },
    });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (target.systemRole) {
      throw new BadRequestException(
        'Cet utilisateur a déjà un rôle système.',
      );
    }
    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { systemRole: SystemRole.ADMIN },
      select: {
        id: true,
        email: true,
        displayName: true,
        systemRole: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Retire le rôle ADMIN d'un utilisateur. Action sensible :
   * - réservée au SUPER_ADMIN
   * - impossible de se dégrader soi-même
   * - impossible de toucher au SUPER_ADMIN
   */
  async demoteAdmin(actorUserId: string, targetUserId: string) {
    await this.assertActorIsSuperAdmin(actorUserId);
    if (actorUserId === targetUserId) {
      throw new BadRequestException(
        'Vous ne pouvez pas retirer votre propre rôle.',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, systemRole: true },
    });
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (target.systemRole === SystemRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Le super administrateur ne peut pas être dégradé.',
      );
    }
    if (target.systemRole !== SystemRole.ADMIN) {
      throw new BadRequestException(
        "Cet utilisateur n'est pas administrateur système.",
      );
    }
    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { systemRole: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        systemRole: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Supprime un utilisateur. Si l'utilisateur a un rôle système,
   * réservé au SUPER_ADMIN ; sinon n'importe quel admin système peut
   * le faire. Le SUPER_ADMIN ne peut pas se supprimer lui-même.
   */
  async deleteUser(actorUserId: string, targetUserId: string) {
    if (actorUserId === targetUserId) {
      throw new BadRequestException(
        'Vous ne pouvez pas supprimer votre propre compte ici.',
      );
    }
    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { systemRole: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, systemRole: true },
      }),
    ]);
    if (!actor?.systemRole) {
      throw new ForbiddenException();
    }
    if (!target) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (target.systemRole === SystemRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Le super administrateur ne peut pas être supprimé.',
      );
    }
    // Suppression d'un autre admin → réservé SUPER_ADMIN.
    if (
      target.systemRole &&
      actor.systemRole !== SystemRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        "Seul le super administrateur peut supprimer un autre administrateur.",
      );
    }
    await this.prisma.user.delete({ where: { id: targetUserId } });
    return true;
  }

  // ---------- helpers ----------

  private async assertActorIsSystemAdmin(actorUserId: string): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { systemRole: true },
    });
    if (
      actor?.systemRole !== SystemRole.ADMIN &&
      actor?.systemRole !== SystemRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException();
    }
  }

  private async assertActorIsSuperAdmin(actorUserId: string): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { systemRole: true },
    });
    if (actor?.systemRole !== SystemRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Réservé au super administrateur.',
      );
    }
  }
}
