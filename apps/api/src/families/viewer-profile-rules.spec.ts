import { MemberStatus } from '@prisma/client';
import {
  ageYearsUtc,
  isStrictlyMinorProfile,
  shouldIncludeMemberInHouseholdViewerProfiles,
} from './viewer-profile-rules';

describe('viewer-profile-rules', () => {
  const viewerUserId = 'user-parent';

  it('ageYearsUtc : anniversaire non encore passé cette année', () => {
    const birth = new Date(Date.UTC(2010, 5, 15));
    const now = new Date(Date.UTC(2026, 2, 1));
    expect(ageYearsUtc(birth, now)).toBe(15);
  });

  it('isStrictlyMinorProfile : vrai si 17 ans', () => {
    const birth = new Date(Date.UTC(2009, 0, 1));
    const now = new Date(Date.UTC(2026, 6, 1));
    expect(isStrictlyMinorProfile(birth, now)).toBe(true);
  });

  it('isStrictlyMinorProfile : faux si 18 ans le jour J', () => {
    const birth = new Date(Date.UTC(2008, 6, 10));
    const now = new Date(Date.UTC(2026, 6, 10));
    expect(isStrictlyMinorProfile(birth, now)).toBe(false);
  });

  it('isStrictlyMinorProfile : faux sans date de naissance', () => {
    expect(isStrictlyMinorProfile(null, new Date())).toBe(false);
  });

  it('shouldInclude : actif + soi (userId)', () => {
    expect(
      shouldIncludeMemberInHouseholdViewerProfiles(
        viewerUserId,
        {
          id: 'm1',
          userId: viewerUserId,
          birthDate: null,
          status: MemberStatus.ACTIVE,
        },
        new Date(),
      ),
    ).toBe(true);
  });

  it('shouldInclude : mineur sans compte (co-parent exclu)', () => {
    const birth = new Date(Date.UTC(2015, 0, 1));
    const now = new Date(Date.UTC(2026, 0, 1));
    expect(
      shouldIncludeMemberInHouseholdViewerProfiles(
        viewerUserId,
        {
          id: 'child',
          userId: null,
          birthDate: birth,
          status: MemberStatus.ACTIVE,
        },
        now,
      ),
    ).toBe(true);
  });

  it('shouldInclude : refuse co-parent (autre userId, majeur)', () => {
    const birth = new Date(Date.UTC(1980, 0, 1));
    const now = new Date(Date.UTC(2026, 0, 1));
    expect(
      shouldIncludeMemberInHouseholdViewerProfiles(
        viewerUserId,
        {
          id: 'coparent',
          userId: 'user-other',
          birthDate: birth,
          status: MemberStatus.ACTIVE,
        },
        now,
      ),
    ).toBe(false);
  });

  it('shouldInclude : refuse inactif', () => {
    expect(
      shouldIncludeMemberInHouseholdViewerProfiles(
        viewerUserId,
        {
          id: 'm1',
          userId: viewerUserId,
          birthDate: null,
          status: MemberStatus.INACTIVE,
        },
        new Date(),
      ),
    ).toBe(false);
  });
});
