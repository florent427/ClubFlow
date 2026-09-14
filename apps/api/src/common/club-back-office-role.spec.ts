import { MembershipRole, SystemRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isBackOfficeMembershipRole,
  resolveAdminWorkspaceClubId,
  userHasClubBackOfficeRole,
} from './club-back-office-role';

/**
 * Qui entre dans le back-office d'un club.
 *
 * Le rôle système — l'équipe de la plateforme — est lu AVANT toute adhésion.
 * Les doubles d'avant n'avaient pas de `user` : depuis l'ajout des admins
 * système, chaque test levait sur `prisma.user` et restait rouge sans rien
 * prouver. Le double applique maintenant les clauses du `where` telles que la
 * fonction les écrit, une à une (cf. pitfalls/double-ignore-une-clause-du-where.md).
 */

type Membership = { userId: string; clubId: string; role: MembershipRole };

function prismaDouble(seed: {
  users?: Array<{ id: string; systemRole: SystemRole | null }>;
  memberships?: Membership[];
  clubs?: Array<{ id: string; createdAt: Date }>;
}) {
  const users = seed.users ?? [{ id: 'u1', systemRole: null }];
  const memberships = seed.memberships ?? [];
  const clubs = seed.clubs ?? [];
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const user = users.find((u) => u.id === where.id);
        return user ? { systemRole: user.systemRole } : null;
      }),
    },
    clubMembership: {
      findUnique: jest.fn(
        async ({ where }: { where: { userId_clubId: { userId: string; clubId: string } } }) =>
          memberships.find(
            (m) =>
              m.userId === where.userId_clubId.userId && m.clubId === where.userId_clubId.clubId,
          ) ?? null,
      ),
      findMany: jest.fn(
        async ({ where }: { where: { userId?: string; role?: { in: MembershipRole[] } } }) => {
          for (const key of Object.keys(where)) {
            if (!['userId', 'role'].includes(key)) throw new Error(`Clause non simulée : ${key}`);
          }
          return memberships
            .filter(
              (m) =>
                (where.userId === undefined || m.userId === where.userId) &&
                (where.role === undefined || where.role.in.includes(m.role)),
            )
            .map((m) => ({ clubId: m.clubId }));
        },
      ),
    },
    club: {
      findFirst: jest.fn(async ({ orderBy }: { orderBy?: { createdAt?: 'asc' | 'desc' } }) => {
        const sorted = [...clubs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (orderBy?.createdAt === 'desc') sorted.reverse();
        return sorted[0] ? { id: sorted[0].id } : null;
      }),
    },
  };
  return prisma as unknown as PrismaService;
}

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
      const prisma = prismaDouble({});
      await expect(userHasClubBackOfficeRole(prisma, 'u1', 'c1')).resolves.toBe(false);
    });

    it('retourne true si adhésion avec rôle admin club', async () => {
      const prisma = prismaDouble({
        memberships: [{ userId: 'u1', clubId: 'c1', role: MembershipRole.CLUB_ADMIN }],
      });
      await expect(userHasClubBackOfficeRole(prisma, 'u1', 'c1')).resolves.toBe(true);
    });

    it('retourne false si rôle non back-office', async () => {
      const prisma = prismaDouble({
        memberships: [{ userId: 'u1', clubId: 'c1', role: MembershipRole.COACH }],
      });
      await expect(userHasClubBackOfficeRole(prisma, 'u1', 'c1')).resolves.toBe(false);
    });

    it('un rôle back-office dans un AUTRE club n’ouvre pas celui-ci', async () => {
      const prisma = prismaDouble({
        memberships: [{ userId: 'u1', clubId: 'c2', role: MembershipRole.CLUB_ADMIN }],
      });
      await expect(userHasClubBackOfficeRole(prisma, 'u1', 'c1')).resolves.toBe(false);
    });

    it('un admin système (ADMIN ou SUPER_ADMIN) entre sans aucune adhésion', async () => {
      for (const systemRole of [SystemRole.ADMIN, SystemRole.SUPER_ADMIN]) {
        const prisma = prismaDouble({ users: [{ id: 'u1', systemRole }] });
        await expect(userHasClubBackOfficeRole(prisma, 'u1', 'c1')).resolves.toBe(true);
      }
    });
  });

  describe('resolveAdminWorkspaceClubId', () => {
    it('retourne null sans adhésion back-office', async () => {
      const prisma = prismaDouble({
        memberships: [{ userId: 'u1', clubId: 'c-membre', role: MembershipRole.COACH }],
      });
      await expect(resolveAdminWorkspaceClubId(prisma, 'u1', 'c-membre')).resolves.toBeNull();
    });

    it('préfère le club du profil membre courant si admin y est', async () => {
      const prisma = prismaDouble({
        memberships: [
          { userId: 'u1', clubId: 'c-autre', role: MembershipRole.CLUB_ADMIN },
          { userId: 'u1', clubId: 'c-membre', role: MembershipRole.TREASURER },
        ],
      });
      await expect(resolveAdminWorkspaceClubId(prisma, 'u1', 'c-membre')).resolves.toBe('c-membre');
    });

    it('sinon retourne un club admin quelconque', async () => {
      const prisma = prismaDouble({
        memberships: [
          // L'adhésion d'un AUTRE utilisateur ne compte pas — placée en tête :
          // sans la clause `userId`, c'est elle qui sortirait.
          { userId: 'u2', clubId: 'c-autre-utilisateur', role: MembershipRole.CLUB_ADMIN },
          { userId: 'u1', clubId: 'c-membre-sans-admin', role: MembershipRole.COACH },
          { userId: 'u1', clubId: 'c-admin-seul', role: MembershipRole.BOARD },
        ],
      });
      await expect(
        resolveAdminWorkspaceClubId(prisma, 'u1', 'c-membre-sans-admin'),
      ).resolves.toBe('c-admin-seul');
    });

    it('admin système : le club du profil courant, sinon le premier club créé, sinon rien', async () => {
      const clubs = [
        { id: 'c-recent', createdAt: new Date('2026-05-01') },
        { id: 'c-ancien', createdAt: new Date('2026-01-01') },
      ];
      const avecClubs = prismaDouble({ users: [{ id: 'u1', systemRole: SystemRole.ADMIN }], clubs });
      await expect(resolveAdminWorkspaceClubId(avecClubs, 'u1', 'c-membre')).resolves.toBe('c-membre');
      await expect(resolveAdminWorkspaceClubId(avecClubs, 'u1', '')).resolves.toBe('c-ancien');

      const sansClub = prismaDouble({ users: [{ id: 'u1', systemRole: SystemRole.SUPER_ADMIN }] });
      await expect(resolveAdminWorkspaceClubId(sansClub, 'u1', 'c-membre')).resolves.toBe('c-membre');
      await expect(resolveAdminWorkspaceClubId(sansClub, 'u1', '')).resolves.toBeNull();
    });
  });
});
