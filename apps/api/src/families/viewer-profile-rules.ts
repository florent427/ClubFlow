import { MemberStatus, type Member } from '@prisma/client';

/**
 * Âge en années entières à la date `now`, en UTC (aligné spec : même référence que tarification si besoin).
 */
export function ageYearsUtc(birthDate: Date, now: Date): number {
  let y = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    y -= 1;
  }
  return y;
}

/** Strictement mineur : `birthDate` obligatoire, âge &lt 18 ans (spec §3.1.1). */
export function isStrictlyMinorProfile(
  birthDate: Date | null | undefined,
  now: Date,
): boolean {
  if (birthDate == null) {
    return false;
  }
  return ageYearsUtc(birthDate, now) < 18;
}

/** Profil sélectionnable pour un foyer étendu (hors chemin legacy « tous les membres »). */
export function shouldIncludeMemberInHouseholdViewerProfiles(
  viewerUserId: string,
  member: Pick<Member, 'id' | 'userId' | 'birthDate' | 'status'>,
  now: Date,
): boolean {
  if (member.status !== MemberStatus.ACTIVE) {
    return false;
  }
  if (member.userId === viewerUserId) {
    return true;
  }
  if (isStrictlyMinorProfile(member.birthDate, now)) {
    return true;
  }
  return false;
}
