import { MembershipRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Rôles autorisés pour le back-office club (aligné sur ClubAdminRoleGuard). */
export function isBackOfficeMembershipRole(role: MembershipRole): boolean {
  return (
    role === MembershipRole.CLUB_ADMIN ||
    role === MembershipRole.BOARD ||
    role === MembershipRole.TREASURER
  );
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
