import { MembershipRole, SystemRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Rôles autorisés pour le back-office club (aligné sur ClubAdminRoleGuard). */
export const CLUB_BACK_OFFICE_ROLES: readonly MembershipRole[] = [
  MembershipRole.CLUB_ADMIN,
  MembershipRole.BOARD,
  MembershipRole.TREASURER,
];

export function isBackOfficeMembershipRole(role: MembershipRole): boolean {
  return CLUB_BACK_OFFICE_ROLES.includes(role);
}

/**
 * Détermine si un utilisateur peut accéder au back-office d'un club.
 *
 * - **Admin système (SystemRole.ADMIN ou SUPER_ADMIN)** : accès à tous
 *   les clubs sans avoir besoin d'un `ClubMembership`. C'est le rôle
 *   transverse qui définit l'équipe de la plateforme.
 * - **Membre du club avec rôle BO** : accès via un `ClubMembership`
 *   dont le rôle est dans `CLUB_BACK_OFFICE_ROLES`.
 */
export async function userHasClubBackOfficeRole(
  prisma: PrismaService,
  userId: string,
  clubId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  });
  if (
    user?.systemRole === SystemRole.SUPER_ADMIN ||
    user?.systemRole === SystemRole.ADMIN
  ) {
    return true;
  }
  const membership = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (!membership) {
    return false;
  }
  return isBackOfficeMembershipRole(membership.role);
}

/**
 * Club à utiliser pour ouvrir le back-office : le club du profil membre courant
 * s’il y a un rôle admin, sinon un club quelconque où l’utilisateur a ce rôle.
 *
 * Pour un admin système sans ClubMembership, retourne le club du profil
 * actif (ou n'importe quel premier club connu) afin qu'il puisse rentrer
 * quelque part par défaut.
 */
export async function resolveAdminWorkspaceClubId(
  prisma: PrismaService,
  userId: string,
  viewerMemberClubId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  });
  // Admin système : on garde le club du viewer s'il existe, sinon on
  // pioche n'importe quel club actif comme workspace par défaut.
  if (
    user?.systemRole === SystemRole.SUPER_ADMIN ||
    user?.systemRole === SystemRole.ADMIN
  ) {
    if (viewerMemberClubId) return viewerMemberClubId;
    const anyClub = await prisma.club.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return anyClub?.id ?? null;
  }
  const rows = await prisma.clubMembership.findMany({
    where: {
      userId,
      role: { in: [...CLUB_BACK_OFFICE_ROLES] },
    },
    select: { clubId: true },
  });
  if (rows.length === 0) {
    return null;
  }
  const preferred = rows.find((r) => r.clubId === viewerMemberClubId);
  if (preferred) {
    return preferred.clubId;
  }
  return rows[0]!.clubId;
}
