import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubEventRegistrationStatus,
  ClubEventStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Viewer = {
  memberId?: string | null;
  contactId?: string | null;
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(clubId: string) {
    const events = await this.prisma.clubEvent.findMany({
      where: { clubId },
      orderBy: [{ startsAt: 'desc' }],
      include: { registrations: true },
    });
    return Promise.all(events.map((e) => this.hydrate(e, {})));
  }

  async listPublished(clubId: string, viewer: Viewer) {
    const events = await this.prisma.clubEvent.findMany({
      where: {
        clubId,
        status: ClubEventStatus.PUBLISHED,
      },
      orderBy: [{ startsAt: 'asc' }],
      include: { registrations: true },
    });
    // filter contact visibility
    const filtered = viewer.contactId
      ? events.filter((e) => e.allowContactRegistration)
      : events;
    return Promise.all(filtered.map((e) => this.hydrate(e, viewer)));
  }

  async create(
    clubId: string,
    input: {
      title: string;
      description?: string;
      location?: string;
      startsAt: Date;
      endsAt: Date;
      capacity?: number;
      registrationOpensAt?: Date;
      registrationClosesAt?: Date;
      priceCents?: number;
      allowContactRegistration?: boolean;
      publishNow?: boolean;
    },
  ) {
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw new BadRequestException('La fin doit être après le début.');
    }
    const publishNow = input.publishNow !== false;
    const ev = await this.prisma.clubEvent.create({
      data: {
        clubId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        capacity: input.capacity ?? null,
        registrationOpensAt: input.registrationOpensAt ?? null,
        registrationClosesAt: input.registrationClosesAt ?? null,
        priceCents: input.priceCents ?? null,
        allowContactRegistration: input.allowContactRegistration === true,
        status: publishNow ? ClubEventStatus.PUBLISHED : ClubEventStatus.DRAFT,
        publishedAt: publishNow ? new Date() : null,
      },
      include: { registrations: true },
    });
    return this.hydrate(ev, {});
  }

  async update(
    clubId: string,
    id: string,
    input: Partial<{
      title: string;
      description: string;
      location: string;
      startsAt: Date;
      endsAt: Date;
      capacity: number;
      registrationOpensAt: Date;
      registrationClosesAt: Date;
      priceCents: number;
      allowContactRegistration: boolean;
    }>,
  ) {
    const existing = await this.prisma.clubEvent.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Événement introuvable');
    const data: Prisma.ClubEventUpdateInput = {};
    for (const [k, v] of Object.entries(input)) {
      if (v !== undefined) (data as Record<string, unknown>)[k] = v;
    }
    const updated = await this.prisma.clubEvent.update({
      where: { id },
      data,
      include: { registrations: true },
    });
    return this.hydrate(updated, {});
  }

  async publish(clubId: string, id: string) {
    const existing = await this.prisma.clubEvent.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Événement introuvable');
    const updated = await this.prisma.clubEvent.update({
      where: { id },
      data: {
        status: ClubEventStatus.PUBLISHED,
        publishedAt: existing.publishedAt ?? new Date(),
      },
      include: { registrations: true },
    });
    return this.hydrate(updated, {});
  }

  async cancel(clubId: string, id: string) {
    const existing = await this.prisma.clubEvent.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Événement introuvable');
    const updated = await this.prisma.clubEvent.update({
      where: { id },
      data: { status: ClubEventStatus.CANCELLED },
      include: { registrations: true },
    });
    return this.hydrate(updated, {});
  }

  async remove(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.clubEvent.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    await this.prisma.clubEvent.delete({ where: { id } });
    return true;
  }

  async register(clubId: string, viewer: Viewer, eventId: string, note?: string) {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis.');
    }
    const event = await this.prisma.clubEvent.findFirst({
      where: { id: eventId, clubId },
      include: { registrations: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    if (event.status !== ClubEventStatus.PUBLISHED) {
      throw new BadRequestException('Événement non ouvert aux inscriptions.');
    }
    if (viewer.contactId && !event.allowContactRegistration) {
      throw new ForbiddenException('Inscription réservée aux adhérents.');
    }
    const now = new Date();
    if (event.registrationOpensAt && event.registrationOpensAt > now) {
      throw new BadRequestException('Inscriptions pas encore ouvertes.');
    }
    if (event.registrationClosesAt && event.registrationClosesAt < now) {
      throw new BadRequestException('Inscriptions fermées.');
    }

    const activeRegs = event.registrations.filter(
      (r) => r.status !== ClubEventRegistrationStatus.CANCELLED,
    );
    const alreadyRegistered = activeRegs.find((r) =>
      viewer.memberId
        ? r.memberId === viewer.memberId
        : r.contactId === viewer.contactId,
    );
    if (alreadyRegistered) return this.hydrate(event, viewer);

    const registeredCount = activeRegs.filter(
      (r) => r.status === ClubEventRegistrationStatus.REGISTERED,
    ).length;
    const isFull = event.capacity !== null && registeredCount >= event.capacity;
    const status = isFull
      ? ClubEventRegistrationStatus.WAITLISTED
      : ClubEventRegistrationStatus.REGISTERED;

    // check for a previously cancelled registration to reuse
    const existing = event.registrations.find((r) =>
      viewer.memberId
        ? r.memberId === viewer.memberId
        : r.contactId === viewer.contactId,
    );
    if (existing) {
      await this.prisma.clubEventRegistration.update({
        where: { id: existing.id },
        data: { status, registeredAt: new Date(), cancelledAt: null, note: note ?? null },
      });
    } else {
      await this.prisma.clubEventRegistration.create({
        data: {
          eventId: event.id,
          memberId: viewer.memberId ?? null,
          contactId: viewer.memberId ? null : viewer.contactId ?? null,
          status,
          note: note ?? null,
        },
      });
    }

    const refreshed = await this.prisma.clubEvent.findUnique({
      where: { id: event.id },
      include: { registrations: true },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, viewer);
  }

  async adminRegisterMember(
    clubId: string,
    eventId: string,
    memberId: string,
    note?: string,
  ) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Adhérent introuvable');
    return this.register(clubId, { memberId }, eventId, note);
  }

  async adminCancelRegistrationById(clubId: string, registrationId: string) {
    const reg = await this.prisma.clubEventRegistration.findFirst({
      where: {
        id: registrationId,
        event: { clubId },
      },
      include: { event: { include: { registrations: true } } },
    });
    if (!reg) throw new NotFoundException('Inscription introuvable');
    const event = reg.event;

    await this.prisma.$transaction(async (tx) => {
      await tx.clubEventRegistration.update({
        where: { id: reg.id },
        data: {
          status: ClubEventRegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      if (
        reg.status === ClubEventRegistrationStatus.REGISTERED &&
        event.capacity !== null
      ) {
        const nextWait = await tx.clubEventRegistration.findFirst({
          where: {
            eventId: event.id,
            status: ClubEventRegistrationStatus.WAITLISTED,
          },
          orderBy: { registeredAt: 'asc' },
        });
        if (nextWait) {
          await tx.clubEventRegistration.update({
            where: { id: nextWait.id },
            data: { status: ClubEventRegistrationStatus.REGISTERED },
          });
        }
      }
    });

    const refreshed = await this.prisma.clubEvent.findUnique({
      where: { id: event.id },
      include: { registrations: true },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, {});
  }

  async cancelRegistration(clubId: string, viewer: Viewer, eventId: string) {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis.');
    }
    const event = await this.prisma.clubEvent.findFirst({
      where: { id: eventId, clubId },
      include: { registrations: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    const existing = event.registrations.find((r) =>
      viewer.memberId
        ? r.memberId === viewer.memberId
        : r.contactId === viewer.contactId,
    );
    if (!existing) return this.hydrate(event, viewer);

    await this.prisma.$transaction(async (tx) => {
      await tx.clubEventRegistration.update({
        where: { id: existing.id },
        data: {
          status: ClubEventRegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      // promote first waitlisted if freed slot
      if (
        existing.status === ClubEventRegistrationStatus.REGISTERED &&
        event.capacity !== null
      ) {
        const nextWait = await tx.clubEventRegistration.findFirst({
          where: {
            eventId: event.id,
            status: ClubEventRegistrationStatus.WAITLISTED,
          },
          orderBy: { registeredAt: 'asc' },
        });
        if (nextWait) {
          await tx.clubEventRegistration.update({
            where: { id: nextWait.id },
            data: { status: ClubEventRegistrationStatus.REGISTERED },
          });
        }
      }
    });

    const refreshed = await this.prisma.clubEvent.findUnique({
      where: { id: event.id },
      include: { registrations: true },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, viewer);
  }

  private async hydrate(
    ev: Prisma.ClubEventGetPayload<{ include: { registrations: true } }>,
    viewer: Viewer,
  ) {
    const activeRegs = ev.registrations.filter(
      (r) => r.status !== ClubEventRegistrationStatus.CANCELLED,
    );
    const registeredCount = activeRegs.filter(
      (r) => r.status === ClubEventRegistrationStatus.REGISTERED,
    ).length;
    const waitlistCount = activeRegs.filter(
      (r) => r.status === ClubEventRegistrationStatus.WAITLISTED,
    ).length;

    let viewerStatus: ClubEventRegistrationStatus | null = null;
    if (viewer.memberId || viewer.contactId) {
      const mine = ev.registrations.find((r) =>
        viewer.memberId
          ? r.memberId === viewer.memberId
          : r.contactId === viewer.contactId,
      );
      if (mine && mine.status !== ClubEventRegistrationStatus.CANCELLED) {
        viewerStatus = mine.status;
      }
    }

    // fetch member/contact names for registration display
    const memberIds = ev.registrations
      .map((r) => r.memberId)
      .filter((x): x is string => !!x);
    const contactIds = ev.registrations
      .map((r) => r.contactId)
      .filter((x): x is string => !!x);
    const [members, contacts] = await Promise.all([
      memberIds.length
        ? this.prisma.member.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      contactIds.length
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);
    const memberName = new Map<string, string>(
      members.map((m) => [m.id, `${m.firstName} ${m.lastName}`.trim()]),
    );
    const contactName = new Map<string, string>(
      contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]),
    );

    return {
      id: ev.id,
      clubId: ev.clubId,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      capacity: ev.capacity,
      registrationOpensAt: ev.registrationOpensAt,
      registrationClosesAt: ev.registrationClosesAt,
      priceCents: ev.priceCents,
      status: ev.status,
      publishedAt: ev.publishedAt,
      allowContactRegistration: ev.allowContactRegistration,
      createdAt: ev.createdAt,
      updatedAt: ev.updatedAt,
      registeredCount,
      waitlistCount,
      viewerRegistrationStatus: viewerStatus,
      registrations: ev.registrations.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        memberId: r.memberId,
        contactId: r.contactId,
        status: r.status,
        registeredAt: r.registeredAt,
        cancelledAt: r.cancelledAt,
        note: r.note,
        displayName: r.memberId
          ? memberName.get(r.memberId) ?? null
          : r.contactId
            ? contactName.get(r.contactId) ?? null
            : null,
      })),
    };
  }
}
