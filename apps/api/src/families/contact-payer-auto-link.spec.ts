import { FamilyMemberLinkRole } from '@prisma/client';
import { memberEligibleForContactPayerAutoLink } from './families.service';

describe('memberEligibleForContactPayerAutoLink', () => {
  it('vrai sans lien foyer', () => {
    expect(memberEligibleForContactPayerAutoLink(null)).toBe(true);
  });

  it('vrai si seul dans le foyer (payeur implicite)', () => {
    expect(
      memberEligibleForContactPayerAutoLink({
        linkRole: FamilyMemberLinkRole.MEMBER,
        memberCountInFamily: 1,
      }),
    ).toBe(true);
  });

  it('vrai si payeur explicite dans un foyer à plusieurs', () => {
    expect(
      memberEligibleForContactPayerAutoLink({
        linkRole: FamilyMemberLinkRole.PAYER,
        memberCountInFamily: 3,
      }),
    ).toBe(true);
  });

  it('faux si simple membre dans un foyer à plusieurs', () => {
    expect(
      memberEligibleForContactPayerAutoLink({
        linkRole: FamilyMemberLinkRole.MEMBER,
        memberCountInFamily: 2,
      }),
    ).toBe(false);
  });
});
