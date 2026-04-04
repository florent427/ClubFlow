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

/** Contexte groupe foyer : inclusion des adultes du même « foyer club » (même familyId) que le payeur. */
export type HouseholdViewerInclusionContext = {
  /** `familyId` du lien `FamilyMember` du candidat dans ce groupe. */
  candidateFamilyId: string;
  /** Foyers résidence où le visiteur est payeur (rôle PAYER membre ou contact). */
  viewerPayerFamilyIds: ReadonlySet<string>;
};

/**
 * Profil sélectionnable pour un foyer étendu (hors chemin legacy « tous les membres »).
 * Par défaut : soi, mineurs du groupe ; pas les autres adultes d’une autre résidence.
 * Avec `householdGroupInclusion` : les adultes du **même** `familyId` que le payeur (même foyer club),
 * comme les mineurs ; exclusion inchangée pour un adulte uniquement dans un foyer séparé du groupe.
 */
export function shouldIncludeMemberInHouseholdViewerProfiles(
  viewerUserId: string,
  member: Pick<Member, 'id' | 'userId' | 'birthDate' | 'status'>,
  now: Date,
  householdGroupInclusion?: HouseholdViewerInclusionContext | null,
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
  if (
    householdGroupInclusion &&
    householdGroupInclusion.viewerPayerFamilyIds.has(
      householdGroupInclusion.candidateFamilyId,
    )
  ) {
    return true;
  }
  return false;
}
