import { MemberStatus } from '@prisma/client';
import { memberMatchesMembershipProduct } from './membership-eligibility';

describe('memberMatchesMembershipProduct', () => {
  const ref = new Date('2026-09-01');

  it('sans critère tout membre actif éligible', () => {
    const ok = memberMatchesMembershipProduct(
      { status: MemberStatus.ACTIVE, birthDate: null, gradeLevelId: null },
      { minAge: null, maxAge: null, gradeLevelIds: [] },
      ref,
    );
    expect(ok).toBe(true);
  });

  it('membre inactif non éligible', () => {
    expect(
      memberMatchesMembershipProduct(
        { status: MemberStatus.INACTIVE, birthDate: null, gradeLevelId: null },
        { minAge: null, maxAge: null, gradeLevelIds: [] },
        ref,
      ),
    ).toBe(false);
  });

  it('règle d’âge sans date de naissance → non éligible', () => {
    expect(
      memberMatchesMembershipProduct(
        { status: MemberStatus.ACTIVE, birthDate: null, gradeLevelId: null },
        { minAge: 10, maxAge: null, gradeLevelIds: [] },
        ref,
      ),
    ).toBe(false);
  });

  it('âge dans les bornes → éligible', () => {
    const birth = new Date('2015-01-15');
    expect(
      memberMatchesMembershipProduct(
        { status: MemberStatus.ACTIVE, birthDate: birth, gradeLevelId: 'g1' },
        { minAge: 8, maxAge: 12, gradeLevelIds: [] },
        ref,
      ),
    ).toBe(true);
  });

  it('âge sous le minimum → non éligible', () => {
    const birth = new Date('2020-06-01');
    expect(
      memberMatchesMembershipProduct(
        { status: MemberStatus.ACTIVE, birthDate: birth, gradeLevelId: null },
        { minAge: 10, maxAge: null, gradeLevelIds: [] },
        ref,
      ),
    ).toBe(false);
  });

  it('grade requis et mauvais grade → non éligible', () => {
    expect(
      memberMatchesMembershipProduct(
        { status: MemberStatus.ACTIVE, birthDate: null, gradeLevelId: 'g-wrong' },
        { minAge: null, maxAge: null, gradeLevelIds: ['g1', 'g2'] },
        ref,
      ),
    ).toBe(false);
  });

  it('grade requis et bon grade → éligible', () => {
    expect(
      memberMatchesMembershipProduct(
        { status: MemberStatus.ACTIVE, birthDate: null, gradeLevelId: 'g2' },
        { minAge: null, maxAge: null, gradeLevelIds: ['g1', 'g2'] },
        ref,
      ),
    ).toBe(true);
  });
});
