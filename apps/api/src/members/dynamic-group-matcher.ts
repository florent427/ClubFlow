import { MemberStatus } from '@prisma/client';

export type DynamicGroupCriteria = {
  minAge: number | null;
  maxAge: number | null;
  /** Si non vide, le membre doit avoir un grade parmi cette liste. */
  gradeLevelIds: string[];
};

export type MemberMatchInput = {
  status: MemberStatus;
  birthDate: Date | null;
  gradeLevelId: string | null;
};

/** Âge en années entières à la date de référence (fuseau local). */
export function ageInYears(birthDate: Date, reference: Date): number {
  let age = reference.getFullYear() - birthDate.getFullYear();
  const md = reference.getMonth() - birthDate.getMonth();
  if (md < 0 || (md === 0 && reference.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

export function memberMatchesDynamicGroup(
  member: MemberMatchInput,
  criteria: DynamicGroupCriteria,
  referenceDate: Date,
): boolean {
  if (member.status !== MemberStatus.ACTIVE) {
    return false;
  }

  const hasAgeRule = criteria.minAge != null || criteria.maxAge != null;
  if (hasAgeRule) {
    if (!member.birthDate) {
      return false;
    }
    const age = ageInYears(member.birthDate, referenceDate);
    if (criteria.minAge != null && age < criteria.minAge) {
      return false;
    }
    if (criteria.maxAge != null && age > criteria.maxAge) {
      return false;
    }
  }

  if (criteria.gradeLevelIds.length > 0) {
    if (
      !member.gradeLevelId ||
      !criteria.gradeLevelIds.includes(member.gradeLevelId)
    ) {
      return false;
    }
  }

  return true;
}
