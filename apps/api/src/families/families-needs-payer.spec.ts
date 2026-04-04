import { FamilyMemberLinkRole } from '@prisma/client';
import { computeFamilyNeedsPayer } from './families.service';

describe('computeFamilyNeedsPayer', () => {
  it('faux si le foyer n’a aucun membre lié', () => {
    expect(computeFamilyNeedsPayer([])).toBe(false);
  });

  it('faux si au moins un payeur', () => {
    expect(
      computeFamilyNeedsPayer([
        { linkRole: FamilyMemberLinkRole.MEMBER },
        { linkRole: FamilyMemberLinkRole.PAYER },
      ]),
    ).toBe(false);
  });

  it('vrai si membres sans payeur', () => {
    expect(
      computeFamilyNeedsPayer([
        { linkRole: FamilyMemberLinkRole.MEMBER },
        { linkRole: FamilyMemberLinkRole.MEMBER },
      ]),
    ).toBe(true);
  });

  it('faux si un seul membre (payeur implicite)', () => {
    expect(
      computeFamilyNeedsPayer([{ linkRole: FamilyMemberLinkRole.MEMBER }]),
    ).toBe(false);
    expect(
      computeFamilyNeedsPayer([{ linkRole: FamilyMemberLinkRole.PAYER }]),
    ).toBe(false);
  });
});
