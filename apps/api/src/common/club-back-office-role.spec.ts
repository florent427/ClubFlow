import { MembershipRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isBackOfficeMembershipRole,
  userHasClubBackOfficeRole,
} from './club-back-office-role';

describe('club-back-office-role', () => {
  describe('isBackOfficeMembershipRole', () => {
    it('retourne true pour CLUB_ADMIN, BOARD, TREASURER', () => {
      expect(isBackOfficeMembershipRole(MembershipRole.CLUB_ADMIN)).toBe(true);
      expect(isBackOfficeMembershipRole(MembershipRole.BOARD)).toBe(true);
      expect(isBackOfficeMembershipRole(MembershipRole.TREASURER)).toBe(true);
    });

    it('retourne false pour les autres rôles', () => {
      expect(isBackOfficeMembershipRole(MembershipRole.COACH)).toBe(false);
      expect(isBackOfficeMembershipRole(MembershipRole.STAFF)).toBe(false);
    });
  });

  describe('userHasClubBackOfficeRole', () => {
    it('retourne false si aucune adhésion', async () => {
      const prisma = {
        clubMembership: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService;
      await expect(
        userHasClubBackOfficeRole(prisma, 'u1', 'c1'),
      ).resolves.toBe(false);
    });

    it('retourne true si adhésion avec rôle admin club', async () => {
      const prisma = {
        clubMembership: {
          findUnique: jest.fn().mockResolvedValue({
            role: MembershipRole.CLUB_ADMIN,
          }),
        },
      } as unknown as PrismaService;
      await expect(
        userHasClubBackOfficeRole(prisma, 'u1', 'c1'),
      ).resolves.toBe(true);
    });

    it('retourne false si rôle non back-office', async () => {
      const prisma = {
        clubMembership: {
          findUnique: jest.fn().mockResolvedValue({
            role: MembershipRole.COACH,
          }),
        },
      } as unknown as PrismaService;
      await expect(
        userHasClubBackOfficeRole(prisma, 'u1', 'c1'),
      ).resolves.toBe(false);
    });
  });
});
