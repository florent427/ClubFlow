import { BadRequestException } from '@nestjs/common';
import { MemberStatus } from '@prisma/client';
import {
  assertEmailsForNewFamilyBatch,
  assertFamilyMayBeDissolved,
  assertMemberEmailAllowedInClub,
  normalizeMemberEmail,
  resolveClubMemberEmailDuplicateForCreate,
} from './member-email-family-rule';

describe('member-email-family-rule', () => {
  it('normalizeMemberEmail', () => {
    expect(normalizeMemberEmail('  A@B.C  ')).toBe('a@b.c');
  });

  describe('assertMemberEmailAllowedInClub', () => {
    it('rejette si doublon avec adhérent sans foyer (nouvelle fiche)', async () => {
      const prisma = {
        member: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'o1', email: 'x@test.fr' },
          ]),
        },
        familyMember: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      await expect(
        assertMemberEmailAllowedInClub(
          prisma as never,
          'c1',
          'X@Test.FR',
          { memberId: null },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('autorise si les deux sont dans le même foyer', async () => {
      const prisma = {
        member: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'o1', email: 'x@test.fr' },
          ]),
        },
        familyMember: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { memberId: 'm1', familyId: 'f1' },
              { memberId: 'o1', familyId: 'f1' },
            ]),
        },
      };
      await expect(
        assertMemberEmailAllowedInClub(
          prisma as never,
          'c1',
          'x@test.fr',
          { memberId: 'm1' },
        ),
      ).resolves.toBeUndefined();
    });

    it('rejette si foyer cible (transfert) differ autre détenteur', async () => {
      const prisma = {
        member: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'o1', email: 'x@test.fr' },
          ]),
        },
        familyMember: {
          findMany: jest.fn().mockResolvedValue([
            { memberId: 'm1', familyId: 'f2' },
            { memberId: 'o1', familyId: 'f1' },
          ]),
        },
      };
      await expect(
        assertMemberEmailAllowedInClub(
          prisma as never,
          'c1',
          'x@test.fr',
          {
            memberId: 'm1',
            assumeMemberFamilyId: 'f2',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveClubMemberEmailDuplicateForCreate', () => {
    it('clear si aucune collision', async () => {
      const prisma = {
        member: { findMany: jest.fn().mockResolvedValue([]) },
        familyMember: { findMany: jest.fn() },
      };
      await expect(
        resolveClubMemberEmailDuplicateForCreate(
          prisma as never,
          'c1',
          'n@e.w',
        ),
      ).resolves.toEqual({ kind: 'clear' });
    });

    it('suggest_family si même e-mail dans un seul foyer', async () => {
      const prisma = {
        member: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'm1',
              email: 'x@test.fr',
              firstName: 'Ada',
              lastName: 'Lovelace',
            },
          ]),
        },
        familyMember: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ memberId: 'm1', familyId: 'f99' }]),
        },
      };
      await expect(
        resolveClubMemberEmailDuplicateForCreate(
          prisma as never,
          'c1',
          'X@Test.FR',
        ),
      ).resolves.toEqual({
        kind: 'suggest_family',
        familyId: 'f99',
        sharedEmail: 'x@test.fr',
        existingMembers: [{ firstName: 'Ada', lastName: 'Lovelace' }],
      });
    });

    it('blocked si un détenteur sans foyer', async () => {
      const prisma = {
        member: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'm1',
              email: 'x@test.fr',
              firstName: 'A',
              lastName: 'B',
            },
          ]),
        },
        familyMember: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const r = await resolveClubMemberEmailDuplicateForCreate(
        prisma as never,
        'c1',
        'x@test.fr',
      );
      expect(r.kind).toBe('blocked');
    });
  });

  describe('assertEmailsForNewFamilyBatch', () => {
    it('rejette si membre hors lot partage la même e-mail', async () => {
      let call = 0;
      const prisma = {
        member: {
          findMany: jest.fn().mockImplementation((args: { where?: { id?: { in: string[] } } }) => {
            call += 1;
            if (call === 1) {
              return Promise.resolve([{ id: 'a', email: 'x@test.fr' }]);
            }
            return Promise.resolve([
              { id: 'z', email: 'x@test.fr' },
            ]);
          }),
        },
        familyMember: { findMany: jest.fn() },
      };
      await expect(
        assertEmailsForNewFamilyBatch(prisma as never, 'c1', ['a']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assertFamilyMayBeDissolved', () => {
    it('rejette si deux membres actifs du foyer ont la même e-mail', async () => {
      const prisma = {
        member: undefined,
        familyMember: {
          findMany: jest.fn().mockResolvedValue([
            {
              member: { email: ' same@test.fr ', status: MemberStatus.ACTIVE },
            },
            {
              member: { email: 'Same@Test.FR', status: MemberStatus.ACTIVE },
            },
          ]),
        },
      };
      await expect(
        assertFamilyMayBeDissolved(prisma as never, 'f1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
