import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CourseSlotBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  async listBookableSlotsForMember(clubId: string, memberId: string, now: Date = new Date()) {
    const slots = await this.prisma.courseSlot.findMany({
      where: {
        clubId,
        bookingEnabled: true,
        endsAt: { gte: now },
        OR: [
          { dynamicGroupId: null },
          {
            dynamicGroup: {
              memberAssignments: { some: { memberId } },
            },
          },
        ],
      },
      orderBy: { startsAt: 'asc' },
      include: {
        venue: true,
        coachMember: { select: { firstName: true, lastName: true } },
        bookings: { select: { status: true, memberId: true } },
      },
    });
    return slots.map((s) => {
      const booked = s.bookings.filter(
        (b) => b.status === CourseSlotBookingStatus.BOOKED,
      ).length;
      const waitlist = s.bookings.filter(
        (b) => b.status === CourseSlotBookingStatus.WAITLISTED,
      ).length;
      const mine = s.bookings.find((b) => b.memberId === memberId);
      return {
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        venueName: s.venue.name,
        coachFirstName: s.coachMember.firstName,
        coachLastName: s.coachMember.lastName,
        bookingCapacity: s.bookingCapacity,
        bookingOpensAt: s.bookingOpensAt,
        bookingClosesAt: s.bookingClosesAt,
        bookedCount: booked,
        waitlistCount: waitlist,
        viewerBookingStatus:
          mine && mine.status !== CourseSlotBookingStatus.CANCELLED
            ? mine.status
            : null,
      };
    });
  }

  async listSlotBookings(clubId: string, slotId: string) {
    const slot = await this.prisma.courseSlot.findFirst({
      where: { id: slotId, clubId },
      include: {
        bookings: {
          include: {
            member: { select: { firstName: true, lastName: true } },
          },
          orderBy: { bookedAt: 'asc' },
        },
      },
    });
    if (!slot) throw new NotFoundException('Créneau introuvable');
    return slot.bookings.map((b) => ({
      id: b.id,
      memberId: b.memberId,
      status: b.status,
      bookedAt: b.bookedAt,
      cancelledAt: b.cancelledAt,
      note: b.note,
      displayName: `${b.member.firstName} ${b.member.lastName}`.trim(),
    }));
  }

  async book(
    clubId: string,
    memberId: string,
    slotId: string,
    note?: string,
  ) {
    const slot = await this.prisma.courseSlot.findFirst({
      where: { id: slotId, clubId },
      include: { bookings: true },
    });
    if (!slot) throw new NotFoundException('Créneau introuvable');
    if (!slot.bookingEnabled) {
      throw new BadRequestException('Ce créneau n’est pas ouvert à la réservation.');
    }
    // verify dynamicGroup access if any
    if (slot.dynamicGroupId) {
      const allowed = await this.prisma.memberDynamicGroup.findFirst({
        where: { dynamicGroupId: slot.dynamicGroupId, memberId },
      });
      if (!allowed) {
        throw new ForbiddenException('Créneau réservé à un groupe.');
      }
    }
    const now = new Date();
    if (slot.bookingOpensAt && slot.bookingOpensAt > now) {
      throw new BadRequestException('Réservations pas encore ouvertes.');
    }
    if (slot.bookingClosesAt && slot.bookingClosesAt < now) {
      throw new BadRequestException('Réservations fermées.');
    }
    const active = slot.bookings.filter(
      (b) => b.status !== CourseSlotBookingStatus.CANCELLED,
    );
    const already = active.find((b) => b.memberId === memberId);
    if (already) return already;

    const bookedCount = active.filter(
      (b) => b.status === CourseSlotBookingStatus.BOOKED,
    ).length;
    const isFull =
      slot.bookingCapacity !== null && bookedCount >= slot.bookingCapacity;
    const status = isFull
      ? CourseSlotBookingStatus.WAITLISTED
      : CourseSlotBookingStatus.BOOKED;

    const existing = slot.bookings.find((b) => b.memberId === memberId);
    if (existing) {
      return this.prisma.courseSlotBooking.update({
        where: { id: existing.id },
        data: {
          status,
          bookedAt: new Date(),
          cancelledAt: null,
          note: note ?? null,
        },
      });
    }
    return this.prisma.courseSlotBooking.create({
      data: {
        courseSlotId: slot.id,
        memberId,
        status,
        note: note ?? null,
      },
    });
  }

  async cancel(clubId: string, memberId: string, slotId: string) {
    const slot = await this.prisma.courseSlot.findFirst({
      where: { id: slotId, clubId },
      include: { bookings: true },
    });
    if (!slot) throw new NotFoundException('Créneau introuvable');
    const existing = slot.bookings.find((b) => b.memberId === memberId);
    if (!existing) return null;
    await this.prisma.$transaction(async (tx) => {
      await tx.courseSlotBooking.update({
        where: { id: existing.id },
        data: {
          status: CourseSlotBookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      if (
        existing.status === CourseSlotBookingStatus.BOOKED &&
        slot.bookingCapacity !== null
      ) {
        const nextWait = await tx.courseSlotBooking.findFirst({
          where: {
            courseSlotId: slot.id,
            status: CourseSlotBookingStatus.WAITLISTED,
          },
          orderBy: { bookedAt: 'asc' },
        });
        if (nextWait) {
          await tx.courseSlotBooking.update({
            where: { id: nextWait.id },
            data: { status: CourseSlotBookingStatus.BOOKED },
          });
        }
      }
    });
    return existing;
  }
}
