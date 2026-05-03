import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubEventRegistrationStatus,
  ClubEventStatus,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { DocumentsGatingService } from '../documents/documents-gating.service';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import {
  memberMatchesDynamicGroup,
  type DynamicGroupCriteria,
} from '../members/dynamic-group-matcher';
import { PrismaService } from '../prisma/prisma.service';
import type { SendEventConvocationInput } from './dto/send-event-convocation.input';
import { EventConvocationMode } from './enums/event-convocation-mode.enum';

type Viewer = {
  memberId?: string | null;
  contactId?: string | null;
  /** Auth user — utilisé pour le gating Documents à signer. */
  userId?: string | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateRange(startsAt: Date, endsAt: Date): string {
  const sameDay =
    startsAt.getFullYear() === endsAt.getFullYear() &&
    startsAt.getMonth() === endsAt.getMonth() &&
    startsAt.getDate() === endsAt.getDate();
  const longDate = startsAt.toLocaleString('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  if (sameDay) {
    const endTime = endsAt.toLocaleString('fr-FR', { timeStyle: 'short' });
    return `${longDate} — jusqu’à ${endTime}`;
  }
  const endFull = endsAt.toLocaleString('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return `${longDate} → ${endFull}`;
}

@Injectable()
export class EventsService {
  private readonly log = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendingDomains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    private readonly documentsGating: DocumentsGatingService,
  ) {}

  /**
   * Refuse l'inscription si le viewer (couple userId + memberId) a des
   * documents requis non signés. Pas de gating si le module DOCUMENTS est
   * désactivé pour le club, ni pour les contacts (qui n'ont pas de fiche
   * membre — on n'a aucun moyen fiable de leur demander une signature).
   *
   * Comportement non bloquant si userId est absent (auto-sécurité : on ne
   * gate que ce qu'on peut tracer côté audit trail).
   */
  private async assertDocumentsSignedOrThrow(
    clubId: string,
    userId: string | null | undefined,
    memberId: string | null | undefined,
  ): Promise<void> {
    if (!userId) return;
    if (!memberId) return;
    const moduleRow = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: { clubId, moduleCode: ModuleCode.DOCUMENTS },
      },
      select: { enabled: true },
    });
    if (!moduleRow?.enabled) return;
    const result = await this.documentsGating.hasUnsignedRequiredDocuments(
      clubId,
      userId,
      memberId,
    );
    if (result.count > 0) {
      const lines = result.documents.map((d) => `- ${d.name}`).join('\n');
      throw new ForbiddenException(
        `Vous devez signer les documents suivants avant de vous inscrire :\n${lines}`,
      );
    }
  }

  async listAdmin(clubId: string) {
    const events = await this.prisma.clubEvent.findMany({
      where: { clubId },
      orderBy: [{ startsAt: 'desc' }],
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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

    // Gating Documents à signer : un membre avec des documents requis
    // non signés ne peut pas s'inscrire à un événement. Le check est
    // silencieux si pas de userId (admin agissant pour le membre — voir
    // adminRegisterMember : on traite ce cas comme une exception manuelle).
    await this.assertDocumentsSignedOrThrow(
      clubId,
      viewer.userId ?? null,
      viewer.memberId ?? null,
    );

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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
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
      include: { registrations: true, attachments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, viewer);
  }

  private async hydrate(
    ev: Prisma.ClubEventGetPayload<{
      include: {
        registrations: true;
        attachments: true;
      };
    }>,
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
      attachments: (ev.attachments ?? []).map((a) => ({
        id: a.id,
        eventId: a.eventId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt,
      })),
    };
  }

  private async loadGroupCriteria(
    clubId: string,
    groupId: string,
  ): Promise<DynamicGroupCriteria | null> {
    const g = await this.prisma.dynamicGroup.findFirst({
      where: { id: groupId, clubId },
      include: { gradeFilters: true },
    });
    if (!g) return null;
    return {
      minAge: g.minAge,
      maxAge: g.maxAge,
      gradeLevelIds: g.gradeFilters.map((f) => f.gradeLevelId),
    };
  }

  /**
   * Envoi d’une convocation e-mail pour un événement.
   * - REGISTERED    : cible les inscrits (members + contacts non annulés)
   * - ALL_MEMBERS   : diffusion à tous les membres ACTIFS du club
   * - DYNAMIC_GROUP : filtre par groupe dynamique (age + grades)
   */
  async sendConvocation(
    clubId: string,
    input: SendEventConvocationInput,
  ): Promise<{
    totalTargets: number;
    sent: number;
    skipped: number;
    suppressed: number;
    failed: number;
  }> {
    const event = await this.prisma.clubEvent.findFirst({
      where: { id: input.eventId, clubId },
      include: { registrations: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');

    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club introuvable');

    // Resolve recipient email set
    const emails = new Set<string>();
    if (input.mode === EventConvocationMode.REGISTERED) {
      const activeRegs = event.registrations.filter(
        (r) => r.status !== ClubEventRegistrationStatus.CANCELLED,
      );
      const memberIds = activeRegs
        .map((r) => r.memberId)
        .filter((x): x is string => !!x);
      const contactIds = activeRegs
        .map((r) => r.contactId)
        .filter((x): x is string => !!x);
      if (memberIds.length) {
        const ms = await this.prisma.member.findMany({
          where: { id: { in: memberIds }, clubId },
          select: { email: true },
        });
        for (const m of ms) {
          const e = (m.email ?? '').trim();
          if (e) emails.add(e);
        }
      }
      if (contactIds.length) {
        const cs = await this.prisma.contact.findMany({
          where: { id: { in: contactIds }, clubId },
          include: { user: true },
        });
        for (const c of cs) {
          const e = (c.user.email ?? '').trim();
          if (e) emails.add(e);
        }
      }
    } else if (input.mode === EventConvocationMode.ALL_MEMBERS) {
      const members = await this.prisma.member.findMany({
        where: { clubId, status: MemberStatus.ACTIVE },
        select: { email: true },
      });
      for (const m of members) {
        const e = (m.email ?? '').trim();
        if (e) emails.add(e);
      }
    } else if (input.mode === EventConvocationMode.DYNAMIC_GROUP) {
      if (!input.dynamicGroupId) {
        throw new BadRequestException('Groupe dynamique requis.');
      }
      const criteria = await this.loadGroupCriteria(
        clubId,
        input.dynamicGroupId,
      );
      if (!criteria) {
        throw new BadRequestException('Groupe dynamique inconnu');
      }
      const members = await this.prisma.member.findMany({
        where: { clubId, status: MemberStatus.ACTIVE },
        select: {
          email: true,
          status: true,
          birthDate: true,
          gradeLevelId: true,
        },
      });
      const now = new Date();
      for (const m of members) {
        if (
          !memberMatchesDynamicGroup(
            {
              status: m.status,
              birthDate: m.birthDate,
              gradeLevelId: m.gradeLevelId,
            },
            criteria,
            now,
          )
        ) {
          continue;
        }
        const e = (m.email ?? '').trim();
        if (e) emails.add(e);
      }
    } else {
      throw new BadRequestException('Mode de convocation invalide.');
    }

    const totalTargets = emails.size;
    if (totalTargets === 0) {
      return { totalTargets: 0, sent: 0, skipped: 0, suppressed: 0, failed: 0 };
    }

    // Suppression list
    const suppressedRows = await this.prisma.emailSuppression.findMany({
      where: { clubId },
      select: { emailNormalized: true },
    });
    const suppressedSet = new Set(suppressedRows.map((s) => s.emailNormalized));

    const profile = await this.sendingDomains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );

    // Build subject / body
    const whenFr = formatDateRange(event.startsAt, event.endsAt);
    const subject =
      (input.subject ?? '').trim() ||
      `${club.name} — Convocation : ${event.title}`;
    const manualBody = (input.body ?? '').trim();
    const defaultLines: string[] = [
      `Bonjour,`,
      ``,
      `Vous êtes convié(e) à l’événement « ${event.title} » organisé par ${club.name}.`,
      ``,
      `Date : ${whenFr}`,
    ];
    if (event.location) defaultLines.push(`Lieu : ${event.location}`);
    if (event.description) {
      defaultLines.push('', event.description);
    }
    defaultLines.push('', 'À bientôt,', club.name);
    const bodyText = manualBody || defaultLines.join('\n');
    const bodyHtml = `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:15px;line-height:1.55">${escapeHtml(
      bodyText,
    )}</div>`;

    let sent = 0;
    let skipped = 0;
    let suppressed = 0;
    let failed = 0;
    for (const raw of emails) {
      const norm = raw.toLowerCase();
      if (!raw.includes('@')) {
        skipped += 1;
        continue;
      }
      if (suppressedSet.has(norm)) {
        suppressed += 1;
        continue;
      }
      try {
        await this.mail.sendEmail({
          clubId,
          kind: 'transactional',
          from: profile.from,
          to: raw,
          subject,
          html: bodyHtml,
          text: bodyText,
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        this.log.error(
          `events.convocation_send_failed event=${event.id} to=${norm}: ${err}`,
        );
      }
    }

    this.log.log(
      JSON.stringify({
        event: 'events.convocation_sent',
        eventId: event.id,
        clubId,
        mode: input.mode,
        totalTargets,
        sent,
        skipped,
        suppressed,
        failed,
      }),
    );

    return { totalTargets, sent, skipped, suppressed, failed };
  }
}
