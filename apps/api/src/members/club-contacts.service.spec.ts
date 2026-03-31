import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberCivility, MemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClubContactsService,
  PROMOTE_CONTACT_DEFAULT_CIVILITY,
} from './club-contacts.service';

describe('ClubContactsService', () => {
  let service: ClubContactsService;
  let prisma: {
    contact: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: { update: jest.Mock };
    member: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  const clubId = 'club-1';
  const userId = 'user-1';
  const contactId = 'contact-1';
  const baseUser = {
    id: userId,
    email: 'a@b.c',
    emailVerifiedAt: new Date(),
    displayName: 'Old Name',
  };
  const baseContact = {
    id: contactId,
    clubId,
    userId,
    firstName: 'Jean',
    lastName: 'Dupont',
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-02'),
    user: baseUser,
  };

  beforeEach(async () => {
    prisma = {
      contact: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      member: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClubContactsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ClubContactsService);
  });

  describe('listClubContacts', () => {
    it('expose canDeleteContact false et linkedMemberId si membre existe', async () => {
      prisma.contact.findMany.mockResolvedValue([baseContact]);
      prisma.member.findFirst
        .mockResolvedValueOnce({ id: 'mem-1' })
        .mockResolvedValueOnce({ id: 'mem-1' });

      const list = await service.listClubContacts(clubId);

      expect(list).toHaveLength(1);
      expect(list[0].linkedMemberId).toBe('mem-1');
      expect(list[0].canDeleteContact).toBe(false);
      expect(list[0].emailVerified).toBe(true);
      expect(prisma.member.findFirst).toHaveBeenCalledWith({
        where: { clubId, userId },
        select: { id: true },
      });
    });

    it('expose canDeleteContact true sans membre', async () => {
      prisma.contact.findMany.mockResolvedValue([baseContact]);
      prisma.member.findFirst.mockResolvedValue(null);

      const list = await service.listClubContacts(clubId);

      expect(list[0].linkedMemberId).toBeNull();
      expect(list[0].canDeleteContact).toBe(true);
    });
  });

  describe('deleteClubContact', () => {
    it('refuse si un membre existe pour le même user et club', async () => {
      prisma.contact.findFirst.mockResolvedValue({
        id: contactId,
        clubId,
        userId,
      });
      prisma.member.findFirst.mockResolvedValue({ id: 'mem-1' });

      await expect(
        service.deleteClubContact(clubId, contactId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.contact.delete).not.toHaveBeenCalled();
    });

    it('supprime le contact si aucun membre', async () => {
      prisma.contact.findFirst.mockResolvedValue({
        id: contactId,
        clubId,
        userId,
      });
      prisma.member.findFirst.mockResolvedValue(null);
      prisma.contact.delete.mockResolvedValue({});

      await service.deleteClubContact(clubId, contactId);

      expect(prisma.contact.delete).toHaveBeenCalledWith({
        where: { id: contactId },
      });
    });
  });

  describe('promoteContactToMember', () => {
    it('refuse si e-mail non vérifié', async () => {
      prisma.contact.findFirst.mockResolvedValue({
        ...baseContact,
        user: { ...baseUser, emailVerifiedAt: null },
      });

      await expect(
        service.promoteContactToMember(clubId, contactId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.member.create).not.toHaveBeenCalled();
    });

    it('refuse si membre déjà présent', async () => {
      prisma.contact.findFirst.mockResolvedValue(baseContact);
      prisma.member.findFirst.mockResolvedValue({ id: 'mem-existing' });

      await expect(
        service.promoteContactToMember(clubId, contactId),
      ).rejects.toThrow(BadRequestException);
    });

    it('crée un membre minimal et retourne memberId', async () => {
      prisma.contact.findFirst.mockResolvedValue(baseContact);
      prisma.member.findFirst.mockResolvedValue(null);
      prisma.member.create.mockResolvedValue({ id: 'mem-new' });

      const res = await service.promoteContactToMember(clubId, contactId);

      expect(res.memberId).toBe('mem-new');
      expect(prisma.member.create).toHaveBeenCalledWith({
        data: {
          clubId,
          userId,
          firstName: 'Jean',
          lastName: 'Dupont',
          civility: PROMOTE_CONTACT_DEFAULT_CIVILITY,
          email: 'a@b.c',
          status: MemberStatus.ACTIVE,
        },
        select: { id: true },
      });
      expect(PROMOTE_CONTACT_DEFAULT_CIVILITY).toBe(MemberCivility.MR);
    });
  });

  describe('updateClubContact', () => {
    it('met à jour le contact et displayName utilisateur', async () => {
      prisma.contact.findFirst
        .mockResolvedValueOnce(baseContact)
        .mockResolvedValueOnce({
          ...baseContact,
          firstName: 'Paul',
          lastName: 'Martin',
        });
      prisma.member.findFirst.mockResolvedValue(null);

      const afterUpdate = {
        ...baseContact,
        firstName: 'Paul',
        lastName: 'Martin',
        user: { ...baseUser, email: 'a@b.c', emailVerifiedAt: new Date() },
      };
      prisma.contact.findFirst.mockResolvedValueOnce(afterUpdate);

      prisma.contact.update.mockResolvedValue({});
      prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
        await Promise.all(ops as Promise<unknown>[]);
      });

      const rec = await service.updateClubContact(clubId, contactId, {
        firstName: 'Paul',
        lastName: 'Martin',
      });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: contactId },
        data: { firstName: 'Paul', lastName: 'Martin' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { displayName: 'Paul Martin' },
      });
      expect(rec.firstName).toBe('Paul');
      expect(rec.lastName).toBe('Martin');
    });

    it('NotFound si contact absent', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      await expect(
        service.updateClubContact(clubId, contactId, {
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
