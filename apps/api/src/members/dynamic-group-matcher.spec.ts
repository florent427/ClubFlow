import { MemberStatus } from '@prisma/client';
import {
  ageInYears,
  memberMatchesDynamicGroup,
} from './dynamic-group-matcher';

describe('dynamic-group-matcher', () => {
  const ref = new Date('2026-06-15T12:00:00.000Z');

  describe('ageInYears', () => {
    it('compte les anniversaires non atteints', () => {
      expect(
        ageInYears(new Date('2010-06-20T00:00:00.000Z'), ref),
      ).toBe(15);
      expect(ageInYears(new Date('2010-06-15T00:00:00.000Z'), ref)).toBe(16);
      expect(ageInYears(new Date('2010-06-14T00:00:00.000Z'), ref)).toBe(16);
    });
  });

  describe('memberMatchesDynamicGroup', () => {
    const base = {
      status: MemberStatus.ACTIVE,
      birthDate: new Date('2016-03-01T00:00:00.000Z'),
      gradeLevelId: 'g-orange' as string | null,
    };

    it('rejette INACTIVE', () => {
      expect(
        memberMatchesDynamicGroup(
          { ...base, status: MemberStatus.INACTIVE },
          { minAge: null, maxAge: null, gradeLevelIds: [] },
          ref,
        ),
      ).toBe(false);
    });

    it('sans critère âge ni grade, accepte tout actif', () => {
      expect(
        memberMatchesDynamicGroup(
          { ...base, birthDate: null, gradeLevelId: null },
          { minAge: null, maxAge: null, gradeLevelIds: [] },
          ref,
        ),
      ).toBe(true);
    });

    it('règle d’âge sans date de naissance → false', () => {
      expect(
        memberMatchesDynamicGroup(
          { ...base, birthDate: null },
          { minAge: 8, maxAge: 12, gradeLevelIds: [] },
          ref,
        ),
      ).toBe(false);
    });

    it('respecte minAge / maxAge', () => {
      expect(
        memberMatchesDynamicGroup(base, { minAge: 5, maxAge: 11, gradeLevelIds: [] }, ref),
      ).toBe(true);
      expect(
        memberMatchesDynamicGroup(base, { minAge: 13, maxAge: null, gradeLevelIds: [] }, ref),
      ).toBe(false);
    });

    it('filtre par grades quand la liste est non vide', () => {
      expect(
        memberMatchesDynamicGroup(base, { minAge: null, maxAge: null, gradeLevelIds: ['g-orange'] }, ref),
      ).toBe(true);
      expect(
        memberMatchesDynamicGroup(base, { minAge: null, maxAge: null, gradeLevelIds: ['g-bleu'] }, ref),
      ).toBe(false);
    });

    it('sans grade côté membre alors que des grades sont exigés → false', () => {
      expect(
        memberMatchesDynamicGroup(
          { ...base, gradeLevelId: null },
          { minAge: null, maxAge: null, gradeLevelIds: ['g-orange'] },
          ref,
        ),
      ).toBe(false);
    });
  });
});
