import { MemberCivility, MemberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanningService } from './planning.service';

describe('PlanningService — créneaux visibles portail membre', () => {
  let findMany: jest.Mock;
  let service: PlanningService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      courseSlot: { findMany: findMany },
    } as unknown as PrismaService;
    service = new PlanningService(prisma);
  });

  it('filtre les créneaux futurs, sans groupe ou avec groupe assigné au membre', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    await service.listUpcomingCourseSlotsForViewerMember(
      'club-1',
      'member-1',
      now,
    );
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId: 'club-1',
          startsAt: { gte: now },
          OR: [
            { dynamicGroupId: null },
            {
              dynamicGroup: {
                memberAssignments: {
                  some: { memberId: 'member-1' },
                },
              },
            },
          ],
        },
        orderBy: { startsAt: 'asc' },
      }),
    );
    const call = findMany.mock.calls[0][0];
    expect(call.include).toMatchObject({
      venue: true,
      coachMember: true,
    });
  });

  it('retourne les lignes renvoyées par Prisma', async () => {
    const row = {
      id: 'slot-1',
      clubId: 'club-1',
      venueId: 'v1',
      coachMemberId: 'coach-1',
      title: 'Karaté',
      startsAt: new Date('2026-07-01T12:00:00.000Z'),
      endsAt: new Date('2026-07-01T13:00:00.000Z'),
      dynamicGroupId: null,
      venue: {
        id: 'v1',
        clubId: 'club-1',
        name: 'Dojo',
        addressLine: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      coachMember: {
        id: 'coach-1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
        civility: MemberCivility.MR,
        email: 'a@b.c',
        phone: null,
        addressLine: null,
        postalCode: null,
        city: null,
        birthDate: null,
        photoUrl: null,
        medicalCertExpiresAt: null,
        status: MemberStatus.ACTIVE,
        gradeLevelId: null,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    findMany.mockResolvedValue([row]);
    const out = await service.listUpcomingCourseSlotsForViewerMember(
      'club-1',
      'member-1',
      new Date('2026-06-01'),
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Karaté');
    expect(out[0].venue.name).toBe('Dojo');
    expect(out[0].coachMember.firstName).toBe('A');
  });
});
