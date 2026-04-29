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
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const COMMUNITY_NAME = 'Communauté';

function directPairKey(
  clubId: string,
  memberIdA: string,
  memberIdB: string,
): string {
  const [a, b] =
    memberIdA < memberIdB
      ? [memberIdA, memberIdB]
      : [memberIdB, memberIdA];
  return `${clubId}:${a}:${b}`;
}

export type ScopeTarget = {
  targetKind: ChatRoomPermissionTarget;
  targetValue: string | null;
  dynamicGroupId?: string | null;
};

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertRoomMember(
    clubId: string,
    roomId: string,
    memberId: string,
  ): Promise<void> {
    const m = await this.prisma.chatRoomMember.findFirst({
      where: {
        memberId,
        room: { id: roomId, clubId },
      },
    });
    if (!m) {
      throw new ForbiddenException('Accès au salon refusé');
    }
  }

  async ensureCommunityRoom(clubId: string): Promise<{ id: string }> {
    let room = await this.prisma.chatRoom.findFirst({
      where: { clubId, kind: ChatRoomKind.COMMUNITY },
    });
    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: {
          clubId,
          kind: ChatRoomKind.COMMUNITY,
          name: COMMUNITY_NAME,
        },
      });
    }
    const members = await this.prisma.member.findMany({
      where: { clubId, status: MemberStatus.ACTIVE },
      select: { id: true },
    });
    for (const m of members) {
      await this.prisma.chatRoomMember.upsert({
        where: {
          roomId_memberId: { roomId: room.id, memberId: m.id },
        },
        create: {
          roomId: room.id,
          memberId: m.id,
          role: ChatRoomMemberRole.MEMBER,
        },
        update: {},
      });
    }
    return { id: room.id };
  }

  async getOrCreateDirectRoom(
    clubId: string,
    memberIdSelf: string,
    peerMemberId: string,
  ): Promise<{ id: string }> {
    if (memberIdSelf === peerMemberId) {
      throw new BadRequestException('Interlocuteur invalide');
    }
    const [a, b] = await Promise.all([
      this.prisma.member.findFirst({
        where: {
          id: memberIdSelf,
          clubId,
          status: MemberStatus.ACTIVE,
        },
      }),
      this.prisma.member.findFirst({
        where: {
          id: peerMemberId,
          clubId,
          status: MemberStatus.ACTIVE,
        },
      }),
    ]);
    if (!a || !b) {
      throw new NotFoundException('Membre introuvable');
    }
    const key = directPairKey(clubId, memberIdSelf, peerMemberId);
    const existing = await this.prisma.chatRoom.findUnique({
      where: { directPairKey: key },
    });
    if (existing) {
      return { id: existing.id };
    }
    const room = await this.prisma.chatRoom.create({
      data: {
        clubId,
        kind: ChatRoomKind.DIRECT,
        directPairKey: key,
        members: {
          create: [
            { memberId: memberIdSelf, role: ChatRoomMemberRole.MEMBER },
            { memberId: peerMemberId, role: ChatRoomMemberRole.MEMBER },
          ],
        },
      },
    });
    return { id: room.id };
  }

  /**
   * Création de groupe par un membre (ne déclenche pas le mode admin).
   * Reste sur OPEN par défaut, sans permissions ni scopes.
   */
  async createGroupRoom(
    clubId: string,
    creatorMemberId: string,
    name: string,
    memberIds: string[],
  ): Promise<{ id: string }> {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new BadRequestException(
        'Nom du groupe : entre 2 et 80 caractères.',
      );
    }
    const uniqueIds = [...new Set([creatorMemberId, ...memberIds])];
    const members = await this.prisma.member.findMany({
      where: {
        clubId,
        status: MemberStatus.ACTIVE,
        id: { in: uniqueIds },
      },
      select: { id: true },
    });
    if (members.length !== uniqueIds.length) {
      throw new BadRequestException('Un ou plusieurs membres sont invalides');
    }
    const room = await this.prisma.chatRoom.create({
      data: {
        clubId,
        kind: ChatRoomKind.GROUP,
        name: trimmed,
        createdByMemberId: creatorMemberId,
        members: {
          create: uniqueIds.map((id) => ({
            memberId: id,
            role:
              id === creatorMemberId
                ? ChatRoomMemberRole.ADMIN
                : ChatRoomMemberRole.MEMBER,
          })),
        },
      },
    });
    return { id: room.id };
  }

  async listRoomsForMember(clubId: string, memberId: string) {
    await this.ensureCommunityRoom(clubId);
    return this.prisma.chatRoom.findMany({
      where: {
        clubId,
        archivedAt: null,
        members: { some: { memberId } },
      },
      orderBy: { updatedAt: 'desc' },
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
      },
    });
  }

  async listMessages(
    clubId: string,
    roomId: string,
    memberId: string,
    beforeMessageId: string | null,
    take = 50,
  ) {
    await this.assertRoomMember(clubId, roomId, memberId);
    let cursorMsg: { createdAt: Date; id: string } | null = null;
    if (beforeMessageId) {
      const cur = await this.prisma.chatMessage.findFirst({
        where: { id: beforeMessageId, roomId, room: { clubId } },
      });
      if (!cur) {
        throw new BadRequestException('Curseur invalide');
      }
      cursorMsg = { createdAt: cur.createdAt, id: cur.id };
    }
    // Ne récupère que les messages racine (parentMessageId null) — les
    // réponses en fil sont chargées à la demande via listThreadReplies.
    const where: Prisma.ChatMessageWhereInput = {
      roomId,
      deletedAt: null,
      parentMessageId: null,
      room: { clubId },
      ...(cursorMsg
        ? {
            OR: [
              { createdAt: { lt: cursorMsg.createdAt } },
              {
                AND: [
                  { createdAt: cursorMsg.createdAt },
                  { id: { lt: cursorMsg.id } },
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

  async listThreadReplies(
    clubId: string,
    roomId: string,
    memberId: string,
    parentMessageId: string,
  ) {
    await this.assertRoomMember(clubId, roomId, memberId);
    return this.prisma.chatMessage.findMany({
      where: {
        roomId,
        room: { clubId },
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
   * Détermine si un membre peut poster un message *racine* dans un salon.
   * Toujours true en mode OPEN. En RESTRICTED, exige une correspondance
   * avec au moins un ChatRoomWritePermission. En READ_ONLY, false.
   */
  async canPostRootMessage(
    clubId: string,
    roomId: string,
    memberId: string,
  ): Promise<boolean> {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, clubId },
      include: { writePermissions: true },
    });
    if (!room) return false;
    if (room.archivedAt) return false;
    if (room.channelMode === ChatRoomChannelMode.READ_ONLY) return false;
    if (room.channelMode === ChatRoomChannelMode.OPEN) return true;
    // RESTRICTED : intersection avec writePermissions
    if (room.writePermissions.length === 0) return true;
    return this.memberMatchesAny(
      clubId,
      memberId,
      room.writePermissions.map((p) => ({
        targetKind: p.targetKind,
        targetValue: p.targetValue,
      })),
    );
  }

  /**
   * Détermine si le membre peut au moins répondre dans un fil. Tout membre
   * du salon peut répondre, sauf si le salon est en READ_ONLY ou archivé.
   */
  async canReplyInThread(
    clubId: string,
    roomId: string,
    memberId: string,
  ): Promise<boolean> {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, clubId },
      select: { channelMode: true, archivedAt: true },
    });
    if (!room) return false;
    if (room.archivedAt) return false;
    if (room.channelMode === ChatRoomChannelMode.READ_ONLY) return false;
    const isMember = await this.prisma.chatRoomMember.findFirst({
      where: { roomId, memberId },
      select: { id: true },
    });
    return Boolean(isMember);
  }

  /**
   * Vérifie si un membre correspond à au moins une des cibles fournies.
   * Charge les rôles système (User), les rôles "membre" (MemberClubRole),
   * les rôles personnalisés (ClubRoleDefinition) et le statut Contact.
   */
  async memberMatchesAny(
    clubId: string,
    memberId: string,
    targets: ScopeTarget[],
  ): Promise<boolean> {
    if (targets.length === 0) return false;
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      select: {
        id: true,
        userId: true,
        roleAssignments: { select: { role: true } },
        customRoleAssignments: {
          select: { roleDefinitionId: true },
        },
      },
    });
    if (!member) return false;

    const memberClubRoles = new Set(
      member.roleAssignments.map((r) => r.role.toString()),
    );
    const customRoleIds = new Set(
      member.customRoleAssignments.map((r) => r.roleDefinitionId),
    );

    let systemRoles: Set<string> | null = null;
    if (member.userId) {
      const memberships = await this.prisma.clubMembership.findMany({
        where: { userId: member.userId, clubId },
        select: { role: true },
      });
      systemRoles = new Set(memberships.map((m) => m.role.toString()));
    }

    // Statut Contact : un Member peut être lié à un Contact via FamilyMember
    // (le payeur sans Member réel reste un Contact). Pour notre test, on
    // considère qu'un Contact est représenté côté espace membre via le
    // contactId / FamilyMember.contactId, pas un Member. Donc la cible
    // CONTACT ne s'applique qu'aux non-Member et n'a aucun effet ici.

    for (const t of targets) {
      switch (t.targetKind) {
        case ChatRoomPermissionTarget.SYSTEM_ROLE:
          if (
            t.targetValue &&
            systemRoles !== null &&
            systemRoles.has(t.targetValue)
          ) {
            return true;
          }
          break;
        case ChatRoomPermissionTarget.MEMBER_ROLE:
          if (t.targetValue && memberClubRoles.has(t.targetValue)) {
            return true;
          }
          break;
        case ChatRoomPermissionTarget.CUSTOM_ROLE:
          if (t.targetValue && customRoleIds.has(t.targetValue)) {
            return true;
          }
          break;
        case ChatRoomPermissionTarget.CONTACT:
          // Membre ≠ Contact : non applicable.
          break;
      }
    }
    return false;
  }

  async postMessage(
    clubId: string,
    roomId: string,
    senderMemberId: string,
    body: string,
    options?: {
      parentMessageId?: string | null;
      postedAsAdminUserId?: string | null;
    },
  ) {
    const text = body.trim();
    if (!text) {
      throw new BadRequestException('Message vide');
    }
    await this.assertRoomMember(clubId, roomId, senderMemberId);

    const isAdminAs = Boolean(options?.postedAsAdminUserId);
    const parentId = options?.parentMessageId ?? null;

    if (parentId) {
      // Réponse en fil : exige juste de pouvoir répondre.
      const allowed = isAdminAs
        ? true
        : await this.canReplyInThread(clubId, roomId, senderMemberId);
      if (!allowed) {
        throw new ForbiddenException('Réponse non autorisée dans ce salon');
      }
      const parent = await this.prisma.chatMessage.findFirst({
        where: { id: parentId, roomId, parentMessageId: null },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Message parent introuvable');
      }
    } else {
      // Message racine : exige la permission d'écriture.
      const allowed = isAdminAs
        ? true
        : await this.canPostRootMessage(clubId, roomId, senderMemberId);
      if (!allowed) {
        throw new ForbiddenException(
          'Écriture non autorisée pour votre rôle dans ce salon',
        );
      }
    }

    const msg = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderMemberId,
        body: text,
        parentMessageId: parentId,
        postedAsAdminUserId: options?.postedAsAdminUserId ?? null,
      },
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

    if (parentId) {
      // Met à jour le compteur du message parent.
      await this.prisma.chatMessage.update({
        where: { id: parentId },
        data: {
          replyCount: { increment: 1 },
          lastReplyAt: msg.createdAt,
        },
      });
    }

    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });
    return msg;
  }

  /**
   * Bascule la réaction (memberId, messageId, emoji). Renvoie un état :
   * - reacted: true si la réaction est désormais présente, false si retirée.
   * - count : nombre de réactions de ce même emoji sur ce message après op.
   */
  async toggleReaction(
    clubId: string,
    memberId: string,
    messageId: string,
    emoji: string,
  ): Promise<{ reacted: boolean; count: number }> {
    const trimmed = emoji.trim();
    if (!trimmed || trimmed.length > 16) {
      throw new BadRequestException('Emoji invalide');
    }
    // Vérifier que le membre a accès au salon de ce message.
    const msg = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, room: { clubId } },
      select: { id: true, roomId: true },
    });
    if (!msg) {
      throw new NotFoundException('Message introuvable');
    }
    await this.assertRoomMember(clubId, msg.roomId, memberId);

    const existing = await this.prisma.chatMessageReaction.findUnique({
      where: {
        messageId_memberId_emoji: {
          messageId,
          memberId,
          emoji: trimmed,
        },
      },
    });
    if (existing) {
      await this.prisma.chatMessageReaction.delete({
        where: { id: existing.id },
      });
    } else {
      await this.prisma.chatMessageReaction.create({
        data: { messageId, memberId, clubId, emoji: trimmed },
      });
    }
    const count = await this.prisma.chatMessageReaction.count({
      where: { messageId, emoji: trimmed },
    });
    return { reacted: !existing, count };
  }

  /**
   * Édite un message existant. Vérifie que le viewer est l'auteur ;
   * met à jour `body` et `editedAt`. Refuse si message déjà supprimé
   * ou salon archivé / READ_ONLY.
   */
  async editMessage(
    clubId: string,
    memberId: string,
    messageId: string,
    body: string,
  ) {
    const text = body.trim();
    if (!text) {
      throw new BadRequestException('Message vide');
    }
    const msg = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, room: { clubId } },
      include: {
        room: { select: { archivedAt: true, channelMode: true } },
      },
    });
    if (!msg || msg.deletedAt) {
      throw new NotFoundException('Message introuvable');
    }
    if (msg.senderMemberId !== memberId) {
      throw new ForbiddenException(
        'Seul l\'auteur peut modifier ce message.',
      );
    }
    if (msg.room.archivedAt) {
      throw new BadRequestException('Salon archivé.');
    }
    if (msg.room.channelMode === ChatRoomChannelMode.READ_ONLY) {
      throw new BadRequestException('Salon en diffusion seule.');
    }
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: text, editedAt: new Date() },
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
   * Supprime un message (soft delete via `deletedAt`).
   *
   * Autorisations :
   * - L'auteur peut toujours supprimer son propre message.
   * - Un membre du salon avec rôle `ADMIN` peut supprimer n'importe quel
   *   message du salon (modération).
   *
   * Conserve les réactions / replies en base pour l'historique.
   */
  async deleteMessage(
    clubId: string,
    memberId: string,
    messageId: string,
  ): Promise<{ id: string; roomId: string }> {
    const msg = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, room: { clubId } },
      select: {
        id: true,
        roomId: true,
        senderMemberId: true,
        deletedAt: true,
      },
    });
    if (!msg || msg.deletedAt) {
      throw new NotFoundException('Message introuvable');
    }
    const isAuthor = msg.senderMemberId === memberId;
    if (!isAuthor) {
      // Vérifie si le viewer est ADMIN du salon.
      const isRoomAdmin = await this.prisma.chatRoomMember.findFirst({
        where: {
          roomId: msg.roomId,
          memberId,
          role: ChatRoomMemberRole.ADMIN,
        },
        select: { id: true },
      });
      if (!isRoomAdmin) {
        throw new ForbiddenException(
          'Seul l\'auteur ou un admin du salon peut supprimer ce message.',
        );
      }
    }
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    return { id: messageId, roomId: msg.roomId };
  }

  /**
   * Récupère le `roomId` d'un message du club. Utile pour le resolver
   * (broadcast d'événements gateway après mutation).
   */
  async getMessageRoomId(
    clubId: string,
    messageId: string,
  ): Promise<string | null> {
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, room: { clubId } },
      select: { roomId: true },
    });
    return m?.roomId ?? null;
  }

  /**
   * Récupère les compteurs `replyCount` / `lastReplyAt` d'un message
   * (utilisé pour la diffusion live après un nouveau reply).
   */
  async getMessageThreadCounters(
    clubId: string,
    messageId: string,
  ): Promise<{ replyCount: number; lastReplyAt: Date | null } | null> {
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, room: { clubId } },
      select: { replyCount: true, lastReplyAt: true },
    });
    return m ? { replyCount: m.replyCount, lastReplyAt: m.lastReplyAt } : null;
  }

  async assertClubAdmin(clubId: string, userId: string): Promise<void> {
    const m = await this.prisma.clubMembership.findFirst({
      where: {
        clubId,
        userId,
        role: {
          in: [
            MembershipRole.CLUB_ADMIN,
            MembershipRole.BOARD,
            MembershipRole.STAFF,
          ],
        },
      },
    });
    if (!m) {
      throw new ForbiddenException('Action réservée aux administrateurs');
    }
  }
}
