import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
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
import { MediaAssetsService } from '../media/media-assets.service';
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

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return base.length > 0 ? base : 'evenement';
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
    private readonly mediaAssets: MediaAssetsService,
  ) {}

  /**
   * Résout l'URL publique de l'image d'illustration d'un événement à
   * partir de son mediaAssetId (localhost → API_PUBLIC_URL réécrit).
   */
  private async resolveCoverUrl(
    coverMediaAssetId: string | null,
  ): Promise<string | null> {
    if (!coverMediaAssetId) return null;
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: coverMediaAssetId },
      select: { publicUrl: true },
    });
    return this.mediaAssets.resolvePublicUrl(asset?.publicUrl);
  }

  /**
   * Garde-fou à l'écriture : l'asset de cover doit exister, appartenir au
   * club courant et être une IMAGE. Empêche de référencer l'asset d'un
   * autre tenant ou un PDF (qui donnerait un `<img src=pdf>` cassé sur la
   * vitrine). `null`/`undefined` = pas de cover → rien à valider.
   */
  private async assertValidCoverAsset(
    clubId: string,
    coverMediaAssetId: string | null | undefined,
  ): Promise<void> {
    if (!coverMediaAssetId) return;
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: coverMediaAssetId, clubId, kind: 'IMAGE' },
      select: { id: true },
    });
    if (!asset) {
      throw new BadRequestException("Image d'illustration invalide.");
    }
  }

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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
    });
    // filter contact visibility
    const filtered = viewer.contactId
      ? events.filter((e) => e.allowContactRegistration)
      : events;
    return Promise.all(
      filtered.map((e) => this.hydrate(e, viewer, { exposeRoster: false })),
    );
  }

  /**
   * Résout le slug public d'un événement : slug fourni (nettoyé) ou dérivé
   * du titre, avec suffixe numérique si déjà pris par un autre événement du
   * club.
   */
  private async resolvePublicSlug(
    clubId: string,
    desired: string | undefined,
    title: string,
    excludeEventId?: string,
  ): Promise<string> {
    const base = slugify((desired ?? '').trim() || title);
    let candidate = base;
    for (let i = 2; i < 50; i++) {
      const clash = await this.prisma.clubEvent.findFirst({
        where: {
          clubId,
          publicSlug: candidate,
          ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        },
        select: { id: true },
      });
      if (!clash) return candidate;
      candidate = `${base}-${i}`;
    }
    throw new BadRequestException('Impossible de générer un slug unique.');
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
      isPublic?: boolean;
      publicSlug?: string;
      publicHeadline?: string;
      publicDescription?: string;
      publicCtaLabel?: string;
      coverMediaAssetId?: string;
    },
  ) {
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      throw new BadRequestException('La fin doit être après le début.');
    }
    await this.assertValidCoverAsset(clubId, input.coverMediaAssetId);
    const publishNow = input.publishNow !== false;
    const isPublic = input.isPublic === true;
    const publicSlug = isPublic
      ? await this.resolvePublicSlug(clubId, input.publicSlug, input.title)
      : null;
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
        isPublic,
        publicSlug,
        coverMediaAssetId: input.coverMediaAssetId ?? null,
        publicHeadline: input.publicHeadline?.trim() || null,
        publicDescription: input.publicDescription?.trim() || null,
        publicCtaLabel: input.publicCtaLabel?.trim() || null,
      },
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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
      isPublic: boolean;
      publicSlug: string;
      publicHeadline: string;
      publicDescription: string;
      publicCtaLabel: string;
      coverMediaAssetId: string | null;
    }>,
  ) {
    const existing = await this.prisma.clubEvent.findFirst({
      where: { id, clubId },
    });
    if (!existing) throw new NotFoundException('Événement introuvable');
    await this.assertValidCoverAsset(clubId, input.coverMediaAssetId);
    const data: Prisma.ClubEventUpdateInput = {};
    for (const [k, v] of Object.entries(input)) {
      // null explicite accepté (ex. coverMediaAssetId: null pour retirer
      // l'image), undefined ignoré.
      if (v !== undefined) (data as Record<string, unknown>)[k] = v;
    }
    // Slug public : recalculé si l'événement devient public sans slug, ou
    // nettoyé/dédupliqué si fourni explicitement.
    const willBePublic = input.isPublic ?? existing.isPublic;
    if (willBePublic) {
      if (input.publicSlug !== undefined || !existing.publicSlug) {
        data.publicSlug = await this.resolvePublicSlug(
          clubId,
          input.publicSlug ?? existing.publicSlug ?? undefined,
          input.title ?? existing.title,
          id,
        );
      }
    }
    const updated = await this.prisma.clubEvent.update({
      where: { id },
      data,
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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

  /**
   * Remplace le programme de l'événement (replace-all, comme
   * `upsertClubDocumentFields`) : les lignes avec `id` sont mises à jour,
   * les nouvelles créées, les absentes supprimées. Les inscriptions liées
   * à une ligne supprimée sont conservées (programItemId → null via
   * onDelete: SetNull).
   */
  async upsertProgramItems(
    clubId: string,
    eventId: string,
    items: Array<{
      id?: string;
      timeLabel?: string;
      title: string;
      description?: string;
      bookable?: boolean;
      capacity?: number;
      sortOrder?: number;
    }>,
  ) {
    const event = await this.prisma.clubEvent.findFirst({
      where: { id: eventId, clubId },
      include: { programItems: true },
    });
    if (!event) throw new NotFoundException('Événement introuvable');

    const existingIds = new Set(event.programItems.map((pi) => pi.id));
    const keptIds = new Set(
      items.map((i) => i.id).filter((x): x is string => !!x),
    );
    for (const id of keptIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(
          'Ligne de programme inconnue pour cet événement.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
      if (toDelete.length) {
        await tx.clubEventProgramItem.deleteMany({
          where: { id: { in: toDelete }, eventId },
        });
      }
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const data = {
          timeLabel: it.timeLabel?.trim() || null,
          title: it.title.trim(),
          description: it.description?.trim() || null,
          bookable: it.bookable === true,
          capacity: it.capacity ?? null,
          sortOrder: it.sortOrder ?? idx,
        };
        if (it.id) {
          await tx.clubEventProgramItem.update({
            where: { id: it.id },
            data,
          });
        } else {
          await tx.clubEventProgramItem.create({
            data: { ...data, eventId },
          });
        }
      }
    });

    const refreshed = await this.prisma.clubEvent.findUnique({
      where: { id: eventId },
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, {});
  }

  // ================================================================
  // Événements PUBLICS (landing vitrine — visiteur anonyme)
  // ================================================================

  /** Vue publique sanitisée : jamais de données d'inscrits. */
  private async toPublicGraph(
    ev: Prisma.ClubEventGetPayload<{
      include: {
        registrations: { include: { slots: true } };
        programItems: true;
      };
    }>,
  ) {
    const now = new Date();
    const activeRegs = ev.registrations.filter(
      (r) => r.status === ClubEventRegistrationStatus.REGISTERED,
    );
    // Réservations par créneau = lignes de liaison des inscriptions actives.
    const bookedByItem = new Map<string, number>();
    for (const r of activeRegs) {
      for (const slot of r.slots) {
        bookedByItem.set(
          slot.programItemId,
          (bookedByItem.get(slot.programItemId) ?? 0) + 1,
        );
      }
    }
    const remainingSpots =
      ev.capacity !== null
        ? Math.max(0, ev.capacity - activeRegs.length)
        : null;
    const registrationOpen =
      ev.status === ClubEventStatus.PUBLISHED &&
      ev.endsAt > now &&
      (!ev.registrationOpensAt || ev.registrationOpensAt <= now) &&
      (!ev.registrationClosesAt || ev.registrationClosesAt >= now) &&
      (remainingSpots === null || remainingSpots > 0);

    const coverImageUrl = await this.resolveCoverUrl(ev.coverMediaAssetId);

    return {
      id: ev.id,
      title: ev.title,
      location: ev.location,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      priceCents: ev.priceCents,
      publicSlug: ev.publicSlug ?? '',
      publicHeadline: ev.publicHeadline,
      publicDescription: ev.publicDescription ?? ev.description,
      publicCtaLabel: ev.publicCtaLabel,
      coverImageUrl,
      remainingSpots,
      registrationOpen,
      programItems: (ev.programItems ?? []).map((pi) => ({
        id: pi.id,
        timeLabel: pi.timeLabel,
        title: pi.title,
        description: pi.description,
        bookable: pi.bookable,
        remainingSpots:
          pi.capacity !== null
            ? Math.max(0, pi.capacity - (bookedByItem.get(pi.id) ?? 0))
            : null,
        sortOrder: pi.sortOrder,
      })),
    };
  }

  /** Événements publics à venir d'un club (landing liste vitrine). */
  async listPublic(clubSlug: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');
    const events = await this.prisma.clubEvent.findMany({
      where: {
        clubId: club.id,
        isPublic: true,
        status: ClubEventStatus.PUBLISHED,
        endsAt: { gte: new Date() },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        registrations: { include: { slots: true } },
        programItems: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return Promise.all(events.map((e) => this.toPublicGraph(e)));
  }

  /** Détail public d'un événement par slug (landing page). */
  async getPublicBySlug(clubSlug: string, eventSlug: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
      select: { id: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');
    const event = await this.prisma.clubEvent.findFirst({
      where: {
        clubId: club.id,
        publicSlug: eventSlug,
        isPublic: true,
        status: ClubEventStatus.PUBLISHED,
      },
      include: {
        registrations: { include: { slots: true } },
        programItems: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable.');
    return this.toPublicGraph(event);
  }
  // (toPublicGraph est async : resolveCoverUrl fait un lookup MediaAsset)

  /**
   * Inscription publique depuis la landing vitrine : le visiteur devient
   * un Contact du club (upsert User sans mot de passe + Contact, même
   * pattern que `VitrineContactService`) et une inscription est créée sur
   * le créneau choisi, avec contrôle de capacité par créneau ET au niveau
   * événement.
   */
  async registerPublic(input: {
    clubSlug: string;
    eventSlug: string;
    programItemIds?: string[];
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    note?: string;
  }): Promise<{ success: boolean; message: string | null }> {
    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!email || !firstName || !lastName) {
      throw new BadRequestException('Prénom, nom et e-mail requis.');
    }

    const club = await this.prisma.club.findUnique({
      where: { slug: input.clubSlug },
      select: { id: true, name: true },
    });
    if (!club) throw new NotFoundException('Club introuvable.');

    const event = await this.prisma.clubEvent.findFirst({
      where: {
        clubId: club.id,
        publicSlug: input.eventSlug,
        isPublic: true,
        status: ClubEventStatus.PUBLISHED,
      },
      include: {
        registrations: { include: { slots: true } },
        programItems: true,
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable.');

    const now = new Date();
    if (event.endsAt <= now) {
      throw new BadRequestException('Cet événement est terminé.');
    }
    if (event.registrationOpensAt && event.registrationOpensAt > now) {
      throw new BadRequestException(
        'Les inscriptions ne sont pas encore ouvertes.',
      );
    }
    if (event.registrationClosesAt && event.registrationClosesAt < now) {
      throw new BadRequestException('Les inscriptions sont fermées.');
    }

    // Créneaux choisis : un visiteur peut en sélectionner plusieurs.
    // Requis (au moins un) si l'événement propose des créneaux réservables.
    const bookableItems = event.programItems.filter((pi) => pi.bookable);
    const requestedIds = Array.from(new Set(input.programItemIds ?? []));
    const chosenItems = requestedIds.map((id) => {
      const it = bookableItems.find((pi) => pi.id === id);
      if (!it) {
        throw new BadRequestException('Créneau invalide pour cet événement.');
      }
      return it;
    });
    if (bookableItems.length > 0 && chosenItems.length === 0) {
      throw new BadRequestException('Choisissez au moins un créneau.');
    }

    // Visiteur → Contact (pattern VitrineContactService)
    const displayName = `${firstName} ${lastName}`.trim();
    const user = await this.prisma.user.upsert({
      where: { email },
      create: { id: randomUUID(), email, displayName },
      update: {},
    });
    const contact = await this.prisma.contact.upsert({
      where: { userId_clubId: { userId: user.id, clubId: club.id } },
      create: {
        userId: user.id,
        clubId: club.id,
        firstName,
        lastName,
        phone: input.phone?.trim() || null,
      },
      update: {
        // Complète le téléphone s'il manquait, sans écraser l'existant
        phone: input.phone?.trim() || undefined,
      },
    });

    const existing = event.registrations.find(
      (r) => r.contactId === contact.id,
    );
    const existingActive =
      existing && existing.status !== ClubEventRegistrationStatus.CANCELLED;

    // --- Contrôles de capacité (en excluant la propre réservation du
    // visiteur, pour permettre de modifier sa sélection sans faux « complet »).
    const activeRegs = event.registrations.filter(
      (r) => r.status === ClubEventRegistrationStatus.REGISTERED,
    );
    // Capacité événement : nombre de PERSONNES. Ne compte pas ce visiteur
    // s'il est déjà inscrit (il ne prend pas une place de plus).
    if (event.capacity !== null && !existingActive) {
      const activePersons = activeRegs.filter(
        (r) => r.contactId !== contact.id,
      ).length;
      if (activePersons >= event.capacity) {
        throw new BadRequestException('Cet événement est complet.');
      }
    }
    // Capacité par créneau : réservations actives des AUTRES personnes.
    for (const item of chosenItems) {
      if (item.capacity === null) continue;
      const bookedByOthers = activeRegs.reduce((acc, r) => {
        if (r.contactId === contact.id) return acc;
        return acc + r.slots.filter((s) => s.programItemId === item.id).length;
      }, 0);
      if (bookedByOthers >= item.capacity) {
        throw new BadRequestException(
          `Le créneau « ${item.title} » est complet — choisissez-en un autre.`,
        );
      }
    }

    const note = input.note?.trim() || null;

    // Upsert de l'inscription + remplacement de ses créneaux (transaction).
    await this.prisma.$transaction(async (tx) => {
      let registrationId: string;
      if (existing) {
        await tx.clubEventRegistration.update({
          where: { id: existing.id },
          data: {
            status: ClubEventRegistrationStatus.REGISTERED,
            registeredAt: new Date(),
            cancelledAt: null,
            note,
          },
        });
        registrationId = existing.id;
        await tx.clubEventRegistrationSlot.deleteMany({
          where: { registrationId },
        });
      } else {
        const created = await tx.clubEventRegistration.create({
          data: {
            eventId: event.id,
            contactId: contact.id,
            status: ClubEventRegistrationStatus.REGISTERED,
            note,
          },
        });
        registrationId = created.id;
      }
      if (chosenItems.length) {
        await tx.clubEventRegistrationSlot.createMany({
          data: chosenItems.map((item) => ({
            registrationId,
            programItemId: item.id,
          })),
        });
      }
    });

    // E-mail de confirmation best-effort (fallback sender plateforme —
    // un club neuf sans domaine vérifié doit pouvoir organiser sa JPO).
    try {
      const profile = await this.sendingDomains.getAuthMailProfile(club.id);
      const whenFr = formatDateRange(event.startsAt, event.endsAt);
      const lines = [
        `Bonjour ${firstName},`,
        '',
        `Votre inscription à « ${event.title} » (${club.name}) est confirmée.`,
        '',
        `Date : ${whenFr}`,
      ];
      if (event.location) lines.push(`Lieu : ${event.location}`);
      if (chosenItems.length) {
        lines.push('', 'Créneaux réservés :');
        for (const item of chosenItems) {
          lines.push(
            `- ${item.title}${item.timeLabel ? ` (${item.timeLabel})` : ''}`,
          );
        }
      }
      lines.push('', 'À très bientôt,', club.name);
      const text = lines.join('\n');
      await this.mail.sendEmail({
        clubId: club.id,
        kind: 'transactional',
        from: profile.from,
        to: email,
        subject: `${club.name} — Inscription confirmée : ${event.title}`,
        html: `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:15px;line-height:1.55">${escapeHtml(
          text,
        )}</div>`,
        text,
      });
    } catch (err) {
      this.log.warn(
        `events.public_register_confirmation_failed event=${event.id} to=${email}: ${err}`,
      );
    }

    this.log.log(
      JSON.stringify({
        event: 'events.public_registration',
        eventId: event.id,
        clubId: club.id,
        contactId: contact.id,
        slots: chosenItems.map((i) => i.id),
        updated: !!existing,
      }),
    );

    const label =
      chosenItems.length === 1
        ? `Inscription confirmée sur le créneau « ${chosenItems[0].title} ».`
        : chosenItems.length > 1
          ? `Inscription confirmée sur ${chosenItems.length} créneaux.`
          : 'Inscription confirmée.';
    return { success: true, message: label };
  }

  async register(
    clubId: string,
    viewer: Viewer,
    eventId: string,
    note?: string,
    // Back-office (adminRegisterMember) passe true pour récupérer le roster
    // complet ; le portail membre laisse false → il ne voit que sa propre
    // inscription en retour.
    exposeRoster = false,
  ) {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis.');
    }
    const event = await this.prisma.clubEvent.findFirst({
      where: { id: eventId, clubId },
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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
    if (alreadyRegistered) return this.hydrate(event, viewer, { exposeRoster });

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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, viewer, { exposeRoster });
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
    // Admin : exposeRoster=true pour renvoyer le roster complet à l'admin.
    return this.register(clubId, { memberId }, eventId, note, true);
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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    const existing = event.registrations.find((r) =>
      viewer.memberId
        ? r.memberId === viewer.memberId
        : r.contactId === viewer.contactId,
    );
    if (!existing) return this.hydrate(event, viewer, { exposeRoster: false });

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
      include: { registrations: { include: { slots: true } }, attachments: { orderBy: { createdAt: 'asc' } }, programItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!refreshed) throw new NotFoundException('Événement introuvable');
    return this.hydrate(refreshed, viewer, { exposeRoster: false });
  }

  private async hydrate(
    ev: Prisma.ClubEventGetPayload<{
      include: {
        registrations: { include: { slots: true } };
        attachments: true;
        programItems: true;
      };
    }>,
    viewer: Viewer,
    opts: { exposeRoster?: boolean } = {},
  ) {
    // Roster nominatif des inscrits : exposé au back-office (défaut). Côté
    // portail membre (exposeRoster=false), on ne renvoie QUE l'inscription du
    // viewer lui-même — jamais l'identité/notes des autres inscrits (RGPD,
    // principe de moindre exposition).
    const exposeRoster = opts.exposeRoster ?? true;
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

    // Réservations actives par créneau = lignes de liaison des inscriptions
    // non annulées (une inscription peut couvrir plusieurs créneaux).
    const bookedByItem = new Map<string, number>();
    for (const r of activeRegs) {
      for (const slot of r.slots) {
        bookedByItem.set(
          slot.programItemId,
          (bookedByItem.get(slot.programItemId) ?? 0) + 1,
        );
      }
    }
    const itemTitle = new Map<string, string>(
      (ev.programItems ?? []).map((pi) => [pi.id, pi.title]),
    );
    const coverImageUrl = await this.resolveCoverUrl(ev.coverMediaAssetId);

    const rosterRegs = exposeRoster
      ? ev.registrations
      : ev.registrations.filter((r) =>
          viewer.memberId
            ? r.memberId === viewer.memberId
            : viewer.contactId
              ? r.contactId === viewer.contactId
              : false,
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
      isPublic: ev.isPublic,
      publicSlug: ev.publicSlug,
      publicHeadline: ev.publicHeadline,
      publicDescription: ev.publicDescription,
      publicCtaLabel: ev.publicCtaLabel,
      coverMediaAssetId: ev.coverMediaAssetId,
      coverImageUrl,
      createdAt: ev.createdAt,
      updatedAt: ev.updatedAt,
      registeredCount,
      waitlistCount,
      viewerRegistrationStatus: viewerStatus,
      programItems: (ev.programItems ?? []).map((pi) => ({
        id: pi.id,
        eventId: pi.eventId,
        timeLabel: pi.timeLabel,
        title: pi.title,
        description: pi.description,
        bookable: pi.bookable,
        capacity: pi.capacity,
        sortOrder: pi.sortOrder,
        bookedCount: bookedByItem.get(pi.id) ?? 0,
      })),
      registrations: rosterRegs.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        memberId: r.memberId,
        contactId: r.contactId,
        slotTitles: r.slots
          .map((s) => itemTitle.get(s.programItemId) ?? null)
          .filter((t): t is string => !!t),
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
