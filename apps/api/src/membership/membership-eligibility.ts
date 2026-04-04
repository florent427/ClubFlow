import {
  memberMatchesDynamicGroup,
  type DynamicGroupCriteria,
  type MemberMatchInput,
} from '../members/dynamic-group-matcher';

/** Critères d’éligibilité embarqués sur une formule cotisation (âge / grades optionnels). */
export type MembershipProductEligibilityCriteria = DynamicGroupCriteria;

/**
 * Indique si le membre peut souscrire à la formule à la date de référence.
 * Même règles métier que pour un groupe dynamique « critères seuls ».
 */
export function memberMatchesMembershipProduct(
  member: MemberMatchInput,
  criteria: MembershipProductEligibilityCriteria,
  referenceDate: Date,
): boolean {
  return memberMatchesDynamicGroup(member, criteria, referenceDate);
}
