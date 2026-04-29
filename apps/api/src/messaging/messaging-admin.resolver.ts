import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import {
  AdminPostChatMessageInput,
  CreateAdminChatGroupInput,
  UpdateAdminChatGroupInput,
} from './dto/admin-chat-group.input';
import { ChatMessageGql } from './models/chat-message-gql.model';
import {
  ChatRoomGql,
  ChatRoomMemberGql,
  ChatRoomMembershipScopeGql,
  ChatRoomWritePermissionGql,
} from './models/chat-room-gql.model';
import { MessagingAdminService } from './messaging-admin.service';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

type AdminRoomRow = Awaited<
  ReturnType<MessagingAdminService['listAllRooms']>
>[number];

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubModuleEnabledGuard,
  ClubAdminRoleGuard,
)
export class MessagingAdminResolver {
  constructor(
    private readonly messaging: MessagingService,
    private readonly admin: MessagingAdminService,
    private readonly gateway: MessagingGateway,
  ) {}

  @Query(() => [ChatRoomGql], { name: 'clubChatRoomsAdmin' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async clubChatRoomsAdmin(
    @CurrentClub() club: Club,
  ): Promise<ChatRoomGql[]> {
    const rows = await this.admin.listAllRooms(club.id);
    return rows.map((r) => this.toRoomGql(r));
  }

  @Query(() => [ChatMessageGql], { name: 'clubChatRoomMessagesAdmin' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async clubChatRoomMessagesAdmin(
    @CurrentClub() club: Club,
    @Args('roomId', { type: () => ID }) roomId: string,
    @Args('beforeMessageId', { type: () => ID, nullable: true })
    beforeMessageId: string | null,
  ): Promise<ChatMessageGql[]> {
    const rows = await this.admin.listMessagesAdmin(
      club.id,
      roomId,
      beforeMessageId,
    );
    return rows.map((m) => this.toMessageGql(m));
  }

  @Query(() => [ChatMessageGql], { name: 'clubChatThreadRepliesAdmin' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async clubChatThreadRepliesAdmin(
    @CurrentClub() club: Club,
    @Args('roomId', { type: () => ID }) roomId: string,
    @Args('parentMessageId', { type: () => ID }) parentMessageId: string,
  ): Promise<ChatMessageGql[]> {
    const rows = await this.admin.listThreadRepliesAdmin(
      club.id,
      roomId,
      parentMessageId,
    );
    return rows.map((m) => this.toMessageGql(m));
  }

  @Mutation(() => ChatRoomGql, { name: 'adminCreateChatGroup' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async adminCreateChatGroup(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateAdminChatGroupInput,
  ): Promise<ChatRoomGql> {
    const { id } = await this.admin.createGroup(
      club.id,
      user.activeProfileMemberId ?? null,
      {
        name: input.name,
        description: input.description ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        channelMode: input.channelMode,
        isBroadcastChannel: input.isBroadcastChannel,
        memberIds: input.memberIds,
        membershipScopes: input.membershipScopes,
        writePermissions: input.writePermissions,
      },
    );
    const rows = await this.admin.listAllRooms(club.id);
    const r = rows.find((x) => x.id === id);
    if (!r) throw new BadRequestException('Salon introuvable');
    return this.toRoomGql(r);
  }

  @Mutation(() => ChatRoomGql, { name: 'adminUpdateChatGroup' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async adminUpdateChatGroup(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateAdminChatGroupInput,
  ): Promise<ChatRoomGql> {
    await this.admin.updateGroup(club.id, {
      roomId: input.roomId,
      name: input.name,
      description: input.description ?? undefined,
      coverImageUrl: input.coverImageUrl ?? undefined,
      channelMode: input.channelMode,
      isBroadcastChannel: input.isBroadcastChannel,
      archived: input.archived,
      memberIds: input.memberIds,
      membershipScopes: input.membershipScopes,
      writePermissions: input.writePermissions,
    });
    const rows = await this.admin.listAllRooms(club.id);
    const r = rows.find((x) => x.id === input.roomId);
    if (!r) throw new BadRequestException('Salon introuvable');
    return this.toRoomGql(r);
  }

  @Mutation(() => Boolean, { name: 'adminArchiveChatGroup' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async adminArchiveChatGroup(
    @CurrentClub() club: Club,
    @Args('roomId', { type: () => ID }) roomId: string,
  ): Promise<boolean> {
    await this.admin.archiveGroup(club.id, roomId);
    return true;
  }

  @Mutation(() => ChatMessageGql, { name: 'adminPostChatMessage' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async adminPostChatMessage(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AdminPostChatMessageInput,
  ): Promise<ChatMessageGql> {
    const msg = await this.admin.postAsAdmin(
      club.id,
      user.userId,
      input.roomId,
      input.body,
      input.parentMessageId ?? null,
    );
    this.gateway.emitChatMessage(input.roomId, {
      id: msg.id,
      roomId: msg.roomId,
      body: msg.body,
      createdAt: msg.createdAt,
      parentMessageId: msg.parentMessageId,
      sender: {
        id: msg.sender.id,
        pseudo: msg.sender.pseudo,
        firstName: msg.sender.firstName,
        lastName: msg.sender.lastName,
      },
    });
    return this.toMessageGql(msg);
  }

  private toMessageGql(msg: {
    id: string;
    roomId: string;
    body: string;
    createdAt: Date;
    parentMessageId: string | null;
    replyCount: number;
    lastReplyAt: Date | null;
    editedAt: Date | null;
    postedAsAdminUserId: string | null;
    sender: {
      id: string;
      pseudo: string | null;
      firstName: string;
      lastName: string;
    };
    reactions: { memberId: string; emoji: string }[];
  }): ChatMessageGql {
    // Agrège les réactions par emoji (vue admin : pas de viewerMemberId,
    // donc reactedByViewer toujours false côté admin).
    const reactionMap = new Map<string, number>();
    for (const r of msg.reactions) {
      reactionMap.set(r.emoji, (reactionMap.get(r.emoji) ?? 0) + 1);
    }
    return {
      id: msg.id,
      roomId: msg.roomId,
      body: msg.body,
      createdAt: msg.createdAt,
      sender: {
        id: msg.sender.id,
        pseudo: msg.sender.pseudo,
        firstName: msg.sender.firstName,
        lastName: msg.sender.lastName,
      },
      parentMessageId: msg.parentMessageId,
      replyCount: msg.replyCount,
      lastReplyAt: msg.lastReplyAt,
      editedAt: msg.editedAt,
      postedByAdmin: Boolean(msg.postedAsAdminUserId),
      reactions: [...reactionMap.entries()].map(([emoji, count]) => ({
        emoji,
        count,
        reactedByViewer: false,
      })),
    };
  }

  private toRoomGql(row: AdminRoomRow): ChatRoomGql {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      coverImageUrl: row.coverImageUrl,
      channelMode: row.channelMode,
      isBroadcastChannel: row.isBroadcastChannel,
      archivedAt: row.archivedAt,
      updatedAt: row.updatedAt,
      members: row.members.map(
        (m): ChatRoomMemberGql => ({
          memberId: m.memberId,
          role: m.role,
          member: {
            id: m.member.id,
            pseudo: m.member.pseudo,
            firstName: m.member.firstName,
            lastName: m.member.lastName,
          },
        }),
      ),
      writePermissions: row.writePermissions.map(
        (p): ChatRoomWritePermissionGql => ({
          id: p.id,
          targetKind: p.targetKind,
          targetValue: p.targetValue,
        }),
      ),
      membershipScopes: row.membershipScopes.map(
        (s): ChatRoomMembershipScopeGql => ({
          id: s.id,
          targetKind: s.targetKind,
          targetValue: s.targetValue,
          dynamicGroupId: s.dynamicGroupId,
        }),
      ),
      // En vue admin, viewerCanPost / viewerCanReply ne sont pas pertinents ;
      // on renvoie true pour ne pas bloquer l'UI admin.
      viewerCanPost: true,
      viewerCanReply: true,
    };
  }
}
