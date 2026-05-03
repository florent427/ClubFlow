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
  /**
   * Foyers dans lesquels le visiteur a accepté une invitation (le visiteur
   * est `FamilyInvite.consumedByUserId`, le foyer est `FamilyInvite.familyId`).
   * Donne au visiteur la visibilité sur les mineurs de ces foyers — modèle
   * d'invitation **unilatéral** : si Samantha invite Josette, Josette voit
   * les enfants de Samantha ; Samantha ne voit pas les enfants de Josette
   * tant que Josette ne l'a pas invitée en retour.
   */
  viewerInvitedFamilyIds?: ReadonlySet<string>;
};

/**
 * Profil sélectionnable pour un foyer étendu (hors chemin legacy « tous les membres »).
 *
 * Règles (modèle d'invitation unilatéral) :
 * - Soi-même : toujours visible.
 * - Foyer où je suis payeur : tous les membres visibles (adultes + mineurs).
 * - Autre foyer : uniquement les mineurs dont le foyer m'a invité.
 * - Pas de `householdGroupInclusion` : chemin legacy (foyer isolé) — mineurs visibles.
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

  if (householdGroupInclusion) {
    // Contexte groupe foyer étendu : visibilité gouvernée par les liens
    // invitation (unilatéraux), pas par le simple fait d'être mineur.
    if (
      householdGroupInclusion.viewerPayerFamilyIds.has(
        householdGroupInclusion.candidateFamilyId,
      )
    ) {
      return true;
    }
    if (
      isStrictlyMinorProfile(member.birthDate, now) &&
      householdGroupInclusion.viewerInvitedFamilyIds?.has(
        householdGroupInclusion.candidateFamilyId,
      )
    ) {
      return true;
    }
    return false;
  }

  // Chemin legacy (foyer sans groupe étendu) : mineurs visibles comme avant.
  if (isStrictlyMinorProfile(member.birthDate, now)) {
    return true;
  }
  return false;
}
