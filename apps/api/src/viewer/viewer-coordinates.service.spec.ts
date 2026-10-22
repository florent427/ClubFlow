import { BadRequestException } from '@nestjs/common';
import { FamilyMemberLinkRole, MembershipCartStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ViewerCoordinatesTarget } from './dto/viewer-coordinates.input';
import { ViewerCoordinatesService } from './viewer-coordinates.service';

/**
 * Le portail désigne la fiche à compléter par son identifiant : c'est la
 * clause `where` qui prouve qu'elle appartient au foyer payeur. Chaque test
 * fige la clause EXACTE (cf. pitfall « double qui ignore une clause du
 * where ») : en retirer une, c'est ouvrir la fiche d'un autre foyer.
 */

const CLUB = 'club-1';
const PROFILE = { memberId: null, contactId: 'contact-1' };
const COMPLETE = {
  phone: '+262692123456',
  addressLine: '1 rue des Lilas',
  postalCode: '97400',
  city: 'Saint-Denis',
};

function prismaDouble() {
  return {
    contact: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'contact-1',
        firstName: 'Paul',
        lastName: 'Payeur',
        ...COMPLETE,
      }),
      update: jest.fn(),
    },
    member: { findFirst: jest.fn(), update: jest.fn() },
    familyMember: { findFirst: jest.fn() },
    membershipCart: { findFirst: jest.fn() },
    membershipCartPendingItem: { findFirst: jest.fn(), update: jest.fn() },
  };
}

function service(prisma: ReturnType<typeof prismaDouble>) {
  return new ViewerCoordinatesService(prisma as unknown as PrismaService);
}

describe('ViewerCoordinatesService', () => {
  it('ne cherche le foyer que parmi ceux où le compte est PAYEUR, dans ce club', async () => {
    const prisma = prismaDouble();
    prisma.familyMember.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(prisma).update(CLUB, PROFILE, {
        target: ViewerCoordinatesTarget.MEMBER,
        targetId: 'member-9',
        ...COMPLETE,
        birthCity: 'Saint-Pierre',
        birthCountryCode: 'FR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({
      where: {
        contactId: 'contact-1',
        linkRole: FamilyMemberLinkRole.PAYER,
        family: { clubId: CLUB },
      },
      select: { familyId: true },
    });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('refuse un adhérent hors du foyer payeur', async () => {
    const prisma = prismaDouble();
    prisma.familyMember.findFirst
      .mockResolvedValueOnce({ familyId: 'family-1' })
      .mockResolvedValueOnce(null);
    await expect(
      service(prisma).update(CLUB, PROFILE, {
        target: ViewerCoordinatesTarget.MEMBER,
        targetId: 'member-autre',
        ...COMPLETE,
        birthCity: 'Saint-Pierre',
        birthCountryCode: 'FR',
      }),
    ).rejects.toThrow('Adhérent hors de votre foyer.');
    expect(prisma.familyMember.findFirst).toHaveBeenLastCalledWith({
      where: {
        familyId: 'family-1',
        memberId: 'member-autre',
        member: { clubId: CLUB },
      },
      select: { memberId: true },
    });
    expect(prisma.member.update).not.toHaveBeenCalled();
  });

  it('ne modifie une inscription en attente que dans un panier OUVERT du foyer', async () => {
    const prisma = prismaDouble();
    prisma.familyMember.findFirst.mockResolvedValueOnce({ familyId: 'family-1' });
    prisma.membershipCartPendingItem.findFirst.mockResolvedValueOnce(null);
    await expect(
      service(prisma).update(CLUB, PROFILE, {
        target: ViewerCoordinatesTarget.PENDING_ITEM,
        targetId: 'pending-1',
        ...COMPLETE,
        birthCity: 'Saint-Pierre',
        birthCountryCode: 'FR',
      }),
    ).rejects.toThrow('Inscription hors de votre panier.');
    expect(prisma.membershipCartPendingItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'pending-1',
        convertedToMemberId: null,
        cart: {
          clubId: CLUB,
          familyId: 'family-1',
          status: MembershipCartStatus.OPEN,
        },
      },
      select: { id: true },
    });
    expect(prisma.membershipCartPendingItem.update).not.toHaveBeenCalled();
  });

  it('enregistre une inscription en attente avec un portable normalisé', async () => {
    const prisma = prismaDouble();
    prisma.familyMember.findFirst.mockResolvedValueOnce({ familyId: 'family-1' });
    prisma.membershipCartPendingItem.findFirst.mockResolvedValueOnce({ id: 'pending-1' });
    await service(prisma).update(CLUB, PROFILE, {
      target: ViewerCoordinatesTarget.PENDING_ITEM,
      targetId: 'pending-1',
      ...COMPLETE,
      phone: '+262 692 12 34 56',
      birthCity: 'Saint-Pierre',
      birthCityInseeCode: '97416',
      birthCountryCode: 'FR',
    });
    expect(prisma.membershipCartPendingItem.update).toHaveBeenCalledWith({
      where: { id: 'pending-1' },
      data: expect.objectContaining({
        phone: '+262692123456',
        birthCity: 'Saint-Pierre',
        birthCityInseeCode: '97416',
        birthCountryCode: 'FR',
      }),
    });
  });

  it('refuse le contrôle d’un panier d’un autre foyer', async () => {
    const prisma = prismaDouble();
    prisma.familyMember.findFirst.mockResolvedValueOnce({ familyId: 'family-1' });
    prisma.membershipCart.findFirst.mockResolvedValueOnce({
      id: 'cart-x',
      familyId: 'family-autre',
      status: MembershipCartStatus.OPEN,
      items: [],
      pendingItems: [],
    });
    await expect(service(prisma).status(CLUB, PROFILE, 'cart-x')).rejects.toThrow(
      'Projet d’adhésion hors de votre foyer.',
    );
    expect(prisma.membershipCart.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cart-x', clubId: CLUB } }),
    );
  });

  it('bloque la validation et nomme chaque fiche incomplète', async () => {
    const prisma = prismaDouble();
    prisma.familyMember.findFirst.mockResolvedValueOnce({ familyId: 'family-1' });
    prisma.membershipCart.findFirst.mockResolvedValueOnce({
      id: 'cart-1',
      familyId: 'family-1',
      status: MembershipCartStatus.OPEN,
      items: [
        {
          member: {
            id: 'm-1',
            firstName: 'Léa',
            lastName: 'Ancienne',
            phone: '0692123456',
            addressLine: null,
            postalCode: null,
            city: null,
            birthCity: null,
            birthCityInseeCode: null,
            birthCountryCode: null,
          },
        },
      ],
      pendingItems: [
        {
          id: 'p-1',
          firstName: 'Tom',
          lastName: 'Complet',
          ...COMPLETE,
          birthCity: 'Saint-Pierre',
          birthCityInseeCode: '97416',
          birthCountryCode: 'FR',
        },
      ],
    });
    await expect(
      service(prisma).assertCartComplete(CLUB, PROFILE, 'cart-1'),
    ).rejects.toThrow(/Léa Ancienne : .*portable.*/);
  });
});
