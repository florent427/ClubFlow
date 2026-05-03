import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatRoomChannelMode,
  ChatRoomKind,
  ChatRoomMemberRole,
  ChatRoomPermissionTarget,
  MemberStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService, type ScopeTarget } from './messaging.service';

type AdminTargetInput = {
  targetKind: ChatRoomPermissionTarget;
  targetValue?: string | null;
  dynamicGroupId?: string | null;
};

@Injectable()
export class MessagingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * Liste les messages racine d'un salon (vue admin).
   * Pas de check d'appartenance : l'admin a accès à tous les salons du club.
   */
  async listMessagesAdmin(
    clubId: string,
    roomId: string,
    beforeMessageId: string | null,
    take = 50,
  ) {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, clubId },
      select: { id: true },
    });
    if (!room) {
      throw new NotFoundException('Salon introuvable');
    }
    let cursor: { createdAt: Date; id: string } | null = null;
    if (beforeMessageId) {
      const cur = await this.prisma.chatMessage.findFirst({
        where: { id: beforeMessageId, roomId },
        select: { createdAt: true, id: true },
      });
      if (!cur) {
        throw new BadRequestException('Curseur invalide');
      }
      cursor = { createdAt: cur.createdAt, id: cur.id };
    }
    const where: Prisma.ChatMessageWhereInput = {
      roomId,
      deletedAt: null,
      parentMessageId: null,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              {
                AND: [
                  { createdAt: cursor.createdAt },
                  { id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : {}),
    };
    return this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: {
        sender: {
          select: {
            id: true,
            pseudo: true,
            firstName: true,
            lastName: true,
          },
        },
        reactions: true,
      },
    });
  }

  /**
   * Liste les réponses d'un thread (vue admin).
   */
  async listThreadRepliesAdmin(
    clubId: string,
    roomId: string,
    parentMessageId: string,
  ) {
    const parent = await this.prisma.chatMessage.findFirst({
      where: { id: parentMessageId, roomId, room: { clubId } },
      select: { id: true },
    });
    if (!parent) {
      throw new NotFoundException('Message parent introuvable');
    }
    return this.prisma.chatMessage.findMany({
      where: {
        roomId,
        parentMessageId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        sender: {
          select: {
            id: true,
            pseudo: true,
            firstName: true,
            lastName: true,
          },
        },
        reactions: true,
      },
    });
  }

  /**
   * Liste tous les salons d'un club, y compris archivés. Inclut les
   * permissions et scopes pour l'écran d'administration.
   */
  async listAllRooms(clubId: string) {
    return this.prisma.chatRoom.findMany({
      where: { clubId },
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
      include: {
        members: {
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                pseudo: true,
              },
            },
          },
        },
        writePermissions: true,
        membershipScopes: true,
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * Calcule l'ensemble des `memberId` correspondant à un ensemble de scopes.
   * Combine : MemberClubRole, ClubRoleDefinition, MembershipRole (via User),
   * groupes dynamiques (via MemberDynamicGroup).
   */
  async resolveMembersForScopes(
    clubId: string,
    scopes: AdminTargetInput[],
  ): Promise<Set<string>> {
    if (scopes.length === 0) return new Set();
    const memberIds = new Set<string>();

    // 1. Groupes dynamiques.
    const groupIds = scopes
      .filter((s) => s.dynamicGroupId)
      .map((s) => s.dynamicGroupId!) as string[];
    if (groupIds.length > 0) {
      const rows = await this.prisma.memberDynamicGroup.findMany({
        where: { dynamicGroupId: { in: groupIds }, member: { clubId } },
        select: { memberId: true },
      });
      for (const r of rows) memberIds.add(r.memberId);
    }

    // 2. MemberClubRole (STUDENT/COACH/BOARD).
    const memberRoles = scopes
      .filter(
        (s) =>
          s.targetKind === ChatRoomPermissionTarget.MEMBER_ROLE &&
          s.targetValue,
      )
      .map((s) => s.targetValue!);
    if (memberRoles.length > 0) {
      const rows = await this.prisma.memberRoleAssignment.findMany({
        where: {
          role: { in: memberRoles as Prisma.EnumMemberClubRoleFilter['in'] },
          member: { clubId, status: MemberStatus.ACTIVE },
        },
        select: { memberId: true },
      });
      for (const r of rows) memberIds.add(r.memberId);
    }

    // 3. Rôles personnalisés (ClubRoleDefinition).
    const customRoleIds = scopes
      .filter(
        (s) =>
          s.targetKind === ChatRoomPermissionTarget.CUSTOM_ROLE &&
          s.targetValue,
      )
      .map((s) => s.targetValue!);
    if (customRoleIds.length > 0) {
      const rows = await this.prisma.memberCustomRoleAssignment.findMany({
        where: {
          roleDefinitionId: { in: customRoleIds },
          member: { clubId, status: MemberStatus.ACTIVE },
        },
        select: { memberId: true },
      });
      for (const r of rows) memberIds.add(r.memberId);
    }

    // 4. MembershipRole (système, via User → Member).
    const systemRoles = scopes
      .filter(
        (s) =>
          s.targetKind === ChatRoomPermissionTarget.SYSTEM_ROLE &&
          s.targetValue,
      )
      .map((s) => s.targetValue!);
    if (systemRoles.length > 0) {
      const memberships = await this.prisma.clubMembership.findMany({
        where: {
          clubId,
          role: { in: systemRoles as Prisma.EnumMembershipRoleFilter['in'] },
        },
        select: { userId: true },
      });
      const userIds = memberships.map((m) => m.userId);
      if (userIds.length > 0) {
        const members = await this.prisma.member.findMany({
          where: {
            clubId,
            userId: { in: userIds },
            status: MemberStatus.ACTIVE,
          },
          select: { id: true },
        });
        for (const m of members) memberIds.add(m.id);
      }
    }

    return memberIds;
  }

  /**
   * Crée un groupe administré : enregistre `ChatRoom`, ses scopes, ses
   * permissions, puis matérialise la liste des `ChatRoomMember` (union
   * des membres explicites + ceux résolus par les scopes).
   */
  async createGroup(
    clubId: string,
    creatorMemberId: string | null,
    input: {
      name: string;
      description?: string | null;
      coverImageUrl?: string | null;
      channelMode: ChatRoomChannelMode;
      isBroadcastChannel: boolean;
      memberIds: string[];
      membershipScopes: AdminTargetInput[];
      writePermissions: AdminTargetInput[];
    },
  ): Promise<{ id: string }> {
    const trimmed = input.name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new BadRequestException(
        'Nom du groupe : entre 2 et 80 caractères.',
      );
    }

    const scopedMembers = await this.resolveMembersForScopes(
      clubId,
      input.membershipScopes,
    );

    // Vérification des memberIds explicites.
    const explicit = await this.prisma.member.findMany({
      where: {
        clubId,
        status: MemberStatus.ACTIVE,
        id: { in: input.memberIds },
      },
      select: { id: true },
    });
    if (explicit.length !== input.memberIds.length) {
      throw new BadRequestException(
        'Un ou plusieurs membres explicites sont invalides',
      );
    }
    for (const m of explicit) scopedMembers.add(m.id);
    if (creatorMemberId) scopedMembers.add(creatorMemberId);

    const allMemberIds = [...scopedMembers];

    const room = await this.prisma.chatRoom.create({
      data: {
        clubId,
        kind: ChatRoomKind.GROUP,
        name: trimmed,
        description: input.description ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        channelMode: input.channelMode,
        isBroadcastChannel: input.isBroadcastChannel,
        createdByMemberId: creatorMemberId,
        members: {
          create: allMemberIds.map((id) => ({
            memberId: id,
            role:
              creatorMemberId && id === creatorMemberId
                ? ChatRoomMemberRole.ADMIN
                : ChatRoomMemberRole.MEMBER,
          })),
        },
        membershipScopes: {
          create: input.membershipScopes.map((s) => ({
            clubId,
            targetKind: s.targetKind,
            targetValue: s.targetValue ?? null,
            dynamicGroupId: s.dynamicGroupId ?? null,
          })),
        },
        writePermissions: {
          create: input.writePermissions.map((s) => ({
            clubId,
            targetKind: s.targetKind,
            targetValue: s.targetValue ?? null,
          })),
        },
      },
    });
    return { id: room.id };
  }

  /**
   * Met à jour les attributs simples + remplace scopes et permissions
   * (set complet). Recalcule l'appartenance des membres si on touche
   * aux scopes ou aux memberIds explicites.
   */
  async updateGroup(
    clubId: string,
    input: {
      roomId: string;
      name?: string;
      description?: string | null;
      coverImageUrl?: string | null;
      channelMode?: ChatRoomChannelMode;
      isBroadcastChannel?: boolean;
      archived?: boolean;
      memberIds?: string[];
      membershipScopes?: AdminTargetInput[];
      writePermissions?: AdminTargetInput[];
    },
  ): Promise<void> {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: input.roomId, clubId, kind: ChatRoomKind.GROUP },
    });
    if (!room) {
      throw new NotFoundException('Groupe introuvable');
    }

    const data: Prisma.ChatRoomUpdateInput = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length < 2 || trimmed.length > 80) {
        throw new BadRequestException(
          'Nom du groupe : entre 2 et 80 caractères.',
        );
      }
      data.name = trimmed;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.coverImageUrl !== undefined)
      data.coverImageUrl = input.coverImageUrl;
    if (input.channelMode !== undefined) data.channelMode = input.channelMode;
    if (input.isBroadcastChannel !== undefined)
      data.isBroadcastChannel = input.isBroadcastChannel;
    if (input.archived !== undefined) {
      data.archivedAt = input.archived ? new Date() : null;
    }

    await this.prisma.chatRoom.update({
      where: { id: input.roomId },
      data,
    });

    if (input.writePermissions !== undefined) {
      await this.prisma.chatRoomWritePermission.deleteMany({
        where: { roomId: input.roomId },
      });
      if (input.writePermissions.length > 0) {
        await this.prisma.chatRoomWritePermission.createMany({
          data: input.writePermissions.map((p) => ({
            roomId: input.roomId,
            clubId,
            targetKind: p.targetKind,
            targetValue: p.targetValue ?? null,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (input.membershipScopes !== undefined) {
      await this.prisma.chatRoomMembershipScope.deleteMany({
        where: { roomId: input.roomId },
      });
      if (input.membershipScopes.length > 0) {
        await this.prisma.chatRoomMembershipScope.createMany({
          data: input.membershipScopes.map((s) => ({
            roomId: input.roomId,
            clubId,
            targetKind: s.targetKind,
            targetValue: s.targetValue ?? null,
            dynamicGroupId: s.dynamicGroupId ?? null,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Recalcul de l'appartenance des membres.
    if (
      input.membershipScopes !== undefined ||
      input.memberIds !== undefined
    ) {
      const scopes =
        input.membershipScopes ??
        (await this.prisma.chatRoomMembershipScope.findMany({
          where: { roomId: input.roomId },
          select: {
            targetKind: true,
            targetValue: true,
            dynamicGroupId: true,
          },
        }));
      const scopedMembers = await this.resolveMembersForScopes(clubId, scopes);

      let explicitIds: string[] = [];
      if (input.memberIds !== undefined) {
        const explicit = await this.prisma.member.findMany({
          where: {
            clubId,
            status: MemberStatus.ACTIVE,
            id: { in: input.memberIds },
          },
          select: { id: true },
        });
        if (explicit.length !== input.memberIds.length) {
          throw new BadRequestException(
            'Un ou plusieurs membres explicites sont invalides',
          );
        }
        explicitIds = explicit.map((m) => m.id);
      }

      const finalSet = new Set<string>([...scopedMembers, ...explicitIds]);
      const existing = await this.prisma.chatRoomMember.findMany({
        where: { roomId: input.roomId },
        select: { memberId: true },
      });
      const existingSet = new Set(existing.map((m) => m.memberId));
      const toAdd = [...finalSet].filter((id) => !existingSet.has(id));
      const toRemove = [...existingSet].filter((id) => !finalSet.has(id));

      if (toAdd.length > 0) {
        await this.prisma.chatRoomMember.createMany({
          data: toAdd.map((id) => ({
            roomId: input.roomId,
            memberId: id,
            role: ChatRoomMemberRole.MEMBER,
          })),
          skipDuplicates: true,
        });
      }
      if (toRemove.length > 0) {
        await this.prisma.chatRoomMember.deleteMany({
          where: { roomId: input.roomId, memberId: { in: toRemove } },
        });
      }
    }
  }

  /**
   * Archive un salon (lecture seule). Suppression permanente non exposée.
   */
  async archiveGroup(clubId: string, roomId: string): Promise<void> {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, clubId, kind: ChatRoomKind.GROUP },
    });
    if (!room) {
      throw new NotFoundException('Groupe introuvable');
    }
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { archivedAt: new Date() },
    });
  }

  /**
   * Poste un message *en se faisant passer pour* un membre du salon.
   * Vérifie que le membre cible est bien dans le salon. L'audit est
   * conservé via `ChatMessage.postedAsAdminUserId`.
   */
  /**
   * Poste un message dans un salon **au nom de l'admin loggué**.
   *
   * Cherche le `Member` rattaché au User admin (via `Member.userId`) pour
   * ce club. S'il n'est pas encore inscrit dans le salon, l'ajoute
   * automatiquement (un admin a accès à tous les salons par définition).
   *
   * Le champ `postedAsAdminUserId` reste tracé pour audit, et permet à
   * l'UI d'afficher un tag "admin" sur le message.
   */
  async postAsAdmin(
    clubId: string,
    adminUserId: string,
    roomId: string,
    body: string,
    parentMessageId?: string | null,
  ) {
    const adminMember = await this.prisma.member.findFirst({
      where: {
        clubId,
        userId: adminUserId,
        status: MemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!adminMember) {
      throw new ForbiddenException(
        "Votre compte admin n'a pas de fiche membre active dans ce club. Créez-vous une fiche pour pouvoir poster.",
      );
    }

    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, clubId },
      select: { id: true, archivedAt: true },
    });
    if (!room) {
      throw new NotFoundException('Salon introuvable');
    }
    if (room.archivedAt) {
      throw new BadRequestException('Salon archivé : écriture impossible.');
    }

    // Inscrit l'admin au salon si pas déjà membre.
    await this.prisma.chatRoomMember.upsert({
      where: {
        roomId_memberId: { roomId, memberId: adminMember.id },
      },
      create: {
        roomId,
        memberId: adminMember.id,
        role: ChatRoomMemberRole.ADMIN,
      },
      update: {},
    });

    return this.messaging.postMessage(
      clubId,
      roomId,
      adminMember.id,
      body,
      {
        postedAsAdminUserId: adminUserId,
        parentMessageId: parentMessageId ?? null,
      },
    );
  }
}
