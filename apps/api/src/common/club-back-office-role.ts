import { MembershipRole } from '@prisma/client';
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

export async function userHasClubBackOfficeRole(
  prisma: PrismaService,
  userId: string,
  clubId: string,
): Promise<boolean> {
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
 */
export async function resolveAdminWorkspaceClubId(
  prisma: PrismaService,
  userId: string,
  viewerMemberClubId: string,
): Promise<string | null> {
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
