import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatRoomKind,
  ChatRoomMemberRole,
  MemberStatus,
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
    const where: Prisma.ChatMessageWhereInput = {
      roomId,
      deletedAt: null,
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
      },
    });
  }

  async postMessage(
    clubId: string,
    roomId: string,
    senderMemberId: string,
    body: string,
  ) {
    const text = body.trim();
    if (!text) {
      throw new BadRequestException('Message vide');
    }
    await this.assertRoomMember(clubId, roomId, senderMemberId);
    const msg = await this.prisma.chatMessage.create({
      data: {
        roomId,
        senderMemberId,
        body: text,
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
      },
    });
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });
    return msg;
  }
}
