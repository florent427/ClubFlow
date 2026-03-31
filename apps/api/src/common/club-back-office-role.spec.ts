import { MembershipRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isBackOfficeMembershipRole,
  resolveAdminWorkspaceClubId,
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

  describe('resolveAdminWorkspaceClubId', () => {
    it('retourne null sans adhésion back-office', async () => {
      const prisma = {
        clubMembership: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;
      await expect(
        resolveAdminWorkspaceClubId(prisma, 'u1', 'c-membre'),
      ).resolves.toBeNull();
    });

    it('préfère le club du profil membre courant si admin y est', async () => {
      const prisma = {
        clubMembership: {
          findMany: jest.fn().mockResolvedValue([
            { clubId: 'c-autre' },
            { clubId: 'c-membre' },
          ]),
        },
      } as unknown as PrismaService;
      await expect(
        resolveAdminWorkspaceClubId(prisma, 'u1', 'c-membre'),
      ).resolves.toBe('c-membre');
    });

    it('sinon retourne un club admin quelconque', async () => {
      const prisma = {
        clubMembership: {
          findMany: jest.fn().mockResolvedValue([{ clubId: 'c-admin-seul' }]),
        },
      } as unknown as PrismaService;
      await expect(
        resolveAdminWorkspaceClubId(prisma, 'u1', 'c-membre-sans-admin'),
      ).resolves.toBe('c-admin-seul');
    });
  });
});
