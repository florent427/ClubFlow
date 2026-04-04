import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Member,
  MemberClubRole,
  MemberStatus,
  Venue,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseSlotInput } from './dto/create-course-slot.input';
import { CreateVenueInput } from './dto/create-venue.input';
import { UpdateCourseSlotInput } from './dto/update-course-slot.input';
import { CourseSlotGraph } from './models/course-slot.model';
import { assertUtcQuarterHour } from './quarter-hour';
import { VenueGraph } from './models/venue.model';

@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}

  private toVenue(row: {
    id: string;
    clubId: string;
    name: string;
    addressLine: string | null;
  }): VenueGraph {
    return {
      id: row.id,
      clubId: row.clubId,
      name: row.name,
      addressLine: row.addressLine,
    };
  }

  private toSlot(row: {
    id: string;
    clubId: string;
    venueId: string;
    coachMemberId: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    dynamicGroupId: string | null;
  }): CourseSlotGraph {
    return {
      id: row.id,
      clubId: row.clubId,
      venueId: row.venueId,
      coachMemberId: row.coachMemberId,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      dynamicGroupId: row.dynamicGroupId,
    };
  }

  async listVenues(clubId: string): Promise<VenueGraph[]> {
    const rows = await this.prisma.venue.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toVenue(r));
  }

  async createVenue(clubId: string, input: CreateVenueInput): Promise<VenueGraph> {
    const row = await this.prisma.venue.create({
      data: {
        clubId,
        name: input.name,
        addressLine: input.addressLine ?? null,
      },
    });
    return this.toVenue(row);
  }

  private async assertVenueInClub(clubId: string, venueId: string): Promise<void> {
    const v = await this.prisma.venue.findFirst({
      where: { id: venueId, clubId },
    });
    if (!v) {
      throw new BadRequestException('Lieu inconnu pour ce club');
    }
  }

  private async assertCoachMember(clubId: string, coachMemberId: string): Promise<void> {
    const m = await this.prisma.member.findFirst({
      where: {
        id: coachMemberId,
        clubId,
        status: MemberStatus.ACTIVE,
        roleAssignments: { some: { role: MemberClubRole.COACH } },
      },
    });
    if (!m) {
      throw new BadRequestException(
        'Professeur invalide : membre actif avec rôle COACH requis',
      );
    }
  }

  private async assertDynamicGroupInClub(
    clubId: string,
    dynamicGroupId: string,
  ): Promise<void> {
    const g = await this.prisma.dynamicGroup.findFirst({
      where: { id: dynamicGroupId, clubId },
    });
    if (!g) {
      throw new BadRequestException('Groupe dynamique inconnu pour ce club');
    }
  }

  private async assertNoCoachOverlap(
    clubId: string,
    coachMemberId: string,
    startsAt: Date,
    endsAt: Date,
    excludeSlotId?: string,
  ): Promise<void> {
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fin du créneau doit être strictement après le début',
      );
    }
    const clash = await this.prisma.courseSlot.findFirst({
      where: {
        clubId,
        coachMemberId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeSlotId ? { NOT: { id: excludeSlotId } } : {}),
      },
    });
    if (clash) {
      throw new BadRequestException(
        'Conflit d’horaire : ce professeur est déjà affecté sur un créneau qui chevauche',
      );
    }
  }

  async listCourseSlots(clubId: string): Promise<CourseSlotGraph[]> {
    const rows = await this.prisma.courseSlot.findMany({
      where: { clubId },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((r) => this.toSlot(r));
  }

  async createCourseSlot(
    clubId: string,
    input: CreateCourseSlotInput,
  ): Promise<CourseSlotGraph> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    assertUtcQuarterHour('Début', startsAt);
    assertUtcQuarterHour('Fin', endsAt);
    await this.assertVenueInClub(clubId, input.venueId);
    await this.assertCoachMember(clubId, input.coachMemberId);
    if (input.dynamicGroupId) {
      await this.assertDynamicGroupInClub(clubId, input.dynamicGroupId);
    }
    await this.assertNoCoachOverlap(
      clubId,
      input.coachMemberId,
      startsAt,
      endsAt,
    );
    const row = await this.prisma.courseSlot.create({
      data: {
        clubId,
        venueId: input.venueId,
        coachMemberId: input.coachMemberId,
        title: input.title,
        startsAt,
        endsAt,
        dynamicGroupId: input.dynamicGroupId ?? null,
      },
    });
    return this.toSlot(row);
  }

  async updateCourseSlot(
    clubId: string,
    input: UpdateCourseSlotInput,
  ): Promise<CourseSlotGraph> {
    const existing = await this.prisma.courseSlot.findFirst({
      where: { id: input.id, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Créneau introuvable');
    }
    const venueId = input.venueId ?? existing.venueId;
    const coachMemberId = input.coachMemberId ?? existing.coachMemberId;
    const title = input.title ?? existing.title;
    const startsAt = input.startsAt
      ? new Date(input.startsAt)
      : existing.startsAt;
    const endsAt = input.endsAt ? new Date(input.endsAt) : existing.endsAt;
    if (input.startsAt) {
      assertUtcQuarterHour('Début', startsAt);
    }
    if (input.endsAt) {
      assertUtcQuarterHour('Fin', endsAt);
    }
    const dynamicGroupId =
      input.dynamicGroupId !== undefined
        ? input.dynamicGroupId
        : existing.dynamicGroupId;

    await this.assertVenueInClub(clubId, venueId);
    await this.assertCoachMember(clubId, coachMemberId);
    if (dynamicGroupId) {
      await this.assertDynamicGroupInClub(clubId, dynamicGroupId);
    }
    await this.assertNoCoachOverlap(
      clubId,
      coachMemberId,
      startsAt,
      endsAt,
      input.id,
    );

    const row = await this.prisma.courseSlot.update({
      where: { id: input.id },
      data: {
        venueId,
        coachMemberId,
        title,
        startsAt,
        endsAt,
        dynamicGroupId,
      },
    });
    return this.toSlot(row);
  }

  async deleteCourseSlot(clubId: string, slotId: string): Promise<void> {
    const existing = await this.prisma.courseSlot.findFirst({
      where: { id: slotId, clubId },
    });
    if (!existing) {
      throw new NotFoundException('Créneau introuvable');
    }
    await this.prisma.courseSlot.delete({ where: { id: slotId } });
  }

  /** Séances dont le début est >= maintenant (UTC). */
  async countUpcomingSessions(clubId: string): Promise<number> {
    return this.prisma.courseSlot.count({
      where: {
        clubId,
        startsAt: { gte: new Date() },
      },
    });
  }

  /**
   * Créneaux à venir visibles pour un membre (portail) : sans groupe dynamique,
   * ou rattachés à un groupe auquel le membre est assigné (MemberDynamicGroup).
   */
  async listUpcomingCourseSlotsForViewerMember(
    clubId: string,
    memberId: string,
    now: Date = new Date(),
  ): Promise<
    Array<{
      id: string;
      clubId: string;
      venueId: string;
      coachMemberId: string;
      title: string;
      startsAt: Date;
      endsAt: Date;
      dynamicGroupId: string | null;
      venue: Venue;
      coachMember: Member;
    }>
  > {
    return this.prisma.courseSlot.findMany({
      where: {
        clubId,
        startsAt: { gte: now },
        OR: [
          { dynamicGroupId: null },
          {
            dynamicGroup: {
              memberAssignments: {
                some: { memberId },
              },
            },
          },
        ],
      },
      orderBy: { startsAt: 'asc' },
      include: {
        venue: true,
        coachMember: true,
      },
    });
  }
}
