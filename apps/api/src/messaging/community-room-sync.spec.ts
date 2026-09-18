import { ChatRoomKind, ChatRoomMemberRole, MemberStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from './messaging.service';

/**
 * Le salon « Communauté » se synchronise à chaque ouverture de la messagerie.
 * Il le faisait par un `upsert` et un aller-retour par membre actif : jusqu'à
 * 62 requêtes pour SKSR, à chaque liste de salons (audit du 2026-09-14, point
 * 2.6). Ce test compte les écritures, pas leur forme : c'est le coût qui
 * comptait.
 */
describe('MessagingService.ensureCommunityRoom — coût de la synchronisation', () => {
  function monde(options: {
    membresActifs: string[];
    dejaInscrits: string[];
  }) {
    const createMany = jest.fn(async () => ({ count: 0 }));
    const upsert = jest.fn(async () => ({}));
    const prisma = {
      chatRoom: {
        findFirst: jest.fn(async () => ({
          id: 'salon-1',
          clubId: 'club-1',
          kind: ChatRoomKind.COMMUNITY,
        })),
        create: jest.fn(),
      },
      member: {
        findMany: jest.fn(async ({ where }: { where: { status: string } }) => {
          expect(where.status).toBe(MemberStatus.ACTIVE);
          return options.membresActifs.map((id) => ({ id }));
        }),
      },
      chatRoomMember: {
        findMany: jest.fn(async () =>
          options.dejaInscrits.map((memberId) => ({ memberId })),
        ),
        createMany,
        upsert,
      },
    };
    // Le push ne sert pas ici : une notification pousse un message, pas une
    // synchronisation de salon.
    const service = new MessagingService(
      prisma as unknown as PrismaService,
      {} as never,
    );
    return { service, prisma, createMany, upsert };
  }

  it('n’ajoute que les membres absents, en une seule écriture', async () => {
    const w = monde({
      membresActifs: ['m-1', 'm-2', 'm-3'],
      dejaInscrits: ['m-1'],
    });

    await expect(w.service.ensureCommunityRoom('club-1')).resolves.toEqual({
      id: 'salon-1',
    });

    expect(w.createMany).toHaveBeenCalledTimes(1);
    expect(w.createMany).toHaveBeenCalledWith({
      data: [
        { roomId: 'salon-1', memberId: 'm-2', role: ChatRoomMemberRole.MEMBER },
        { roomId: 'salon-1', memberId: 'm-3', role: ChatRoomMemberRole.MEMBER },
      ],
      // Deux ouvertures simultanées ajoutent le même membre.
      skipDuplicates: true,
    });
    expect(w.upsert).not.toHaveBeenCalled();
  });

  it('n’écrit rien quand tout le monde est déjà inscrit', async () => {
    const w = monde({
      membresActifs: ['m-1', 'm-2'],
      dejaInscrits: ['m-1', 'm-2'],
    });

    await w.service.ensureCommunityRoom('club-1');

    expect(w.createMany).not.toHaveBeenCalled();
    expect(w.upsert).not.toHaveBeenCalled();
  });
});
