import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { GqlThrottlerGuard } from '../common/guards/gql-throttler.guard';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CreateChatGroupInput } from './dto/create-chat-group.input';
import { EditChatMessageInput } from './dto/edit-chat-message.input';
import { PostChatMessageInput } from './dto/post-chat-message.input';
import { ToggleMessageReactionInput } from './dto/toggle-message-reaction.input';
import {
  ChatMessageGql,
  ChatMessageReactionGroupGql,
} from './models/chat-message-gql.model';
import {
  ChatMemberSnippetGraph,
  ChatRoomGql,
  ChatRoomMemberGql,
  ChatRoomMembershipScopeGql,
  ChatRoomWritePermissionGql,
} from './models/chat-room-gql.model';
import { MemberSearchResultGraph } from './models/member-search-result.model';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

type RawMessage = {
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
  reactions: {
    id: string;
    memberId: string;
    emoji: string;
  }[];
};

function aggregateReactions(
  reactions: { memberId: string; emoji: string }[],
  viewerMemberId: string,
): ChatMessageReactionGroupGql[] {
  const map = new Map<
    string,
    { count: number; reactedByViewer: boolean }
  >();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { count: 0, reactedByViewer: false };
    cur.count += 1;
    if (r.memberId === viewerMemberId) cur.reactedByViewer = true;
    map.set(r.emoji, cur);
  }
  return [...map.entries()].map(([emoji, v]) => ({
    emoji,
    count: v.count,
    reactedByViewer: v.reactedByViewer,
  }));
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
export class MessagingResolver {
  constructor(
    private readonly messaging: MessagingService,
    private readonly gateway: MessagingGateway,
  ) {}

  @Query(() => [ChatRoomGql], { name: 'viewerChatRooms' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async viewerChatRooms(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ChatRoomGql[]> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const rows = await this.messaging.listRoomsForMember(
      club.id,
      user.activeProfileMemberId,
    );
    const out: ChatRoomGql[] = [];
    for (const r of rows) {
      const canPost = await this.messaging.canPostRootMessage(
        club.id,
        r.id,
        user.activeProfileMemberId,
      );
      const canReply = await this.messaging.canReplyInThread(
        club.id,
        r.id,
        user.activeProfileMemberId,
      );
      out.push(this.toRoomGql(r, canPost, canReply));
    }
    return out;
  }

  @Query(() => [ChatMessageGql], { name: 'viewerChatMessages' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async viewerChatMessages(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('roomId', { type: () => ID }) roomId: string,
    @Args('beforeMessageId', { type: () => ID, nullable: true })
    beforeMessageId: string | null,
  ): Promise<ChatMessageGql[]> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const rows = await this.messaging.listMessages(
      club.id,
      roomId,
      user.activeProfileMemberId,
      beforeMessageId,
    );
    return rows.map((m) =>
      this.toMessageGql(m as RawMessage, user.activeProfileMemberId!),
    );
  }

  @Query(() => [ChatMessageGql], { name: 'viewerChatThreadReplies' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async viewerChatThreadReplies(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('roomId', { type: () => ID }) roomId: string,
    @Args('parentMessageId', { type: () => ID }) parentMessageId: string,
  ): Promise<ChatMessageGql[]> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const rows = await this.messaging.listThreadReplies(
      club.id,
      roomId,
      user.activeProfileMemberId,
      parentMessageId,
    );
    return rows.map((m) =>
      this.toMessageGql(m as RawMessage, user.activeProfileMemberId!),
    );
  }

  @Query(() => [MemberSearchResultGraph], {
    name: 'viewerSearchClubMembers',
    description:
      "Recherche d'adhérents du club courant pour démarrer un chat 1-on-1. " +
      'Match insensible à la casse sur pseudo, firstName, lastName. Retourne ' +
      'au max 20 résultats par défaut, exclut le viewer lui-même.',
  })
  @RequireClubModule(ModuleCode.MESSAGING)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(GqlThrottlerGuard)
  async viewerSearchClubMembers(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('q') q: string,
    @Args('limit', { type: () => Number, nullable: true })
    limit?: number,
  ): Promise<MemberSearchResultGraph[]> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    return this.messaging.searchClubMembers(
      club.id,
      user.activeProfileMemberId,
      q,
      limit ?? 20,
    );
  }

  @Mutation(() => ChatRoomGql, { name: 'viewerGetOrCreateDirectChat' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async viewerGetOrCreateDirectChat(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('peerMemberId', { type: () => ID }) peerMemberId: string,
  ): Promise<ChatRoomGql> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const { id } = await this.messaging.getOrCreateDirectRoom(
      club.id,
      user.activeProfileMemberId,
      peerMemberId,
    );
    const rows = await this.messaging.listRoomsForMember(
      club.id,
      user.activeProfileMemberId,
    );
    const room = rows.find((x) => x.id === id);
    if (!room) {
      throw new BadRequestException('Salon introuvable');
    }
    const canPost = await this.messaging.canPostRootMessage(
      club.id,
      id,
      user.activeProfileMemberId,
    );
    const canReply = await this.messaging.canReplyInThread(
      club.id,
      id,
      user.activeProfileMemberId,
    );
    return this.toRoomGql(room, canPost, canReply);
  }

  @Mutation(() => ChatRoomGql, { name: 'viewerCreateChatGroup' })
  @RequireClubModule(ModuleCode.MESSAGING)
  async viewerCreateChatGroup(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: CreateChatGroupInput,
  ): Promise<ChatRoomGql> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const { id } = await this.messaging.createGroupRoom(
      club.id,
      user.activeProfileMemberId,
      input.name,
      input.memberIds,
    );
    const rows = await this.messaging.listRoomsForMember(
      club.id,
      user.activeProfileMemberId,
    );
    const room = rows.find((x) => x.id === id);
    if (!room) {
      throw new BadRequestException('Salon introuvable');
    }
    const canPost = await this.messaging.canPostRootMessage(
      club.id,
      id,
      user.activeProfileMemberId,
    );
    const canReply = await this.messaging.canReplyInThread(
      club.id,
      id,
      user.activeProfileMemberId,
    );
    return this.toRoomGql(room, canPost, canReply);
  }

  @Mutation(() => ChatMessageGql, { name: 'viewerPostChatMessage' })
  @RequireClubModule(ModuleCode.MESSAGING)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  async viewerPostChatMessage(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: PostChatMessageInput,
  ): Promise<ChatMessageGql> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const msg = await this.messaging.postMessage(
      club.id,
      input.roomId,
      user.activeProfileMemberId,
      input.body,
      { parentMessageId: input.parentMessageId ?? null },
    );
    const gql = this.toMessageGql(
      msg as RawMessage,
      user.activeProfileMemberId,
    );
    this.gateway.emitChatMessage(input.roomId, {
      id: gql.id,
      roomId: gql.roomId,
      body: gql.body,
      createdAt: gql.createdAt,
      parentMessageId: gql.parentMessageId,
      sender: gql.sender,
    });
    if (input.parentMessageId) {
      const counters = await this.messaging.getMessageThreadCounters(
        club.id,
        input.parentMessageId,
      );
      if (counters) {
        this.gateway.emitThreadUpdate(input.roomId, {
          parentMessageId: input.parentMessageId,
          replyCount: counters.replyCount,
          lastReplyAt: counters.lastReplyAt,
        });
      }
    }
    return gql;
  }

  @Mutation(() => ChatMessageReactionGroupGql, {
    name: 'viewerToggleChatMessageReaction',
  })
  @RequireClubModule(ModuleCode.MESSAGING)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async viewerToggleChatMessageReaction(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: ToggleMessageReactionInput,
  ): Promise<ChatMessageReactionGroupGql> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const { reacted, count } = await this.messaging.toggleReaction(
      club.id,
      user.activeProfileMemberId,
      input.messageId,
      input.emoji,
    );
    const roomId = await this.messaging.getMessageRoomId(
      club.id,
      input.messageId,
    );
    if (roomId) {
      this.gateway.emitReactionUpdate(roomId, {
        messageId: input.messageId,
        memberId: user.activeProfileMemberId,
        emoji: input.emoji,
        reacted,
        count,
      });
    }
    return { emoji: input.emoji, count, reactedByViewer: reacted };
  }

  @Mutation(() => ChatMessageGql, { name: 'viewerEditChatMessage' })
  @RequireClubModule(ModuleCode.MESSAGING)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async viewerEditChatMessage(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('input') input: EditChatMessageInput,
  ): Promise<ChatMessageGql> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const msg = await this.messaging.editMessage(
      club.id,
      user.activeProfileMemberId,
      input.messageId,
      input.body,
    );
    const gql = this.toMessageGql(
      msg as RawMessage,
      user.activeProfileMemberId,
    );
    this.gateway.emitMessageEdited(msg.roomId, {
      id: msg.id,
      body: msg.body,
      editedAt: msg.editedAt ?? new Date(),
    });
    return gql;
  }

  @Mutation(() => Boolean, { name: 'viewerDeleteChatMessage' })
  @RequireClubModule(ModuleCode.MESSAGING)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async viewerDeleteChatMessage(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('messageId', { type: () => ID }) messageId: string,
  ): Promise<boolean> {
    if (!user.activeProfileMemberId) {
      throw new BadRequestException('Profil adhérent requis.');
    }
    const { roomId } = await this.messaging.deleteMessage(
      club.id,
      user.activeProfileMemberId,
      messageId,
    );
    this.gateway.emitMessageDeleted(roomId, { id: messageId });
    return true;
  }

  private toRoomGql(
    row: Awaited<ReturnType<MessagingService['listRoomsForMember']>>[0],
    viewerCanPost: boolean,
    viewerCanReply: boolean,
  ): ChatRoomGql {
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
      viewerCanPost,
      viewerCanReply,
    };
  }

  private toMessageGql(
    msg: RawMessage,
    viewerMemberId: string,
  ): ChatMessageGql {
    const sender: ChatMemberSnippetGraph = {
      id: msg.sender.id,
      pseudo: msg.sender.pseudo,
      firstName: msg.sender.firstName,
      lastName: msg.sender.lastName,
    };
    return {
      id: msg.id,
      roomId: msg.roomId,
      body: msg.body,
      createdAt: msg.createdAt,
      sender,
      parentMessageId: msg.parentMessageId,
      replyCount: msg.replyCount,
      lastReplyAt: msg.lastReplyAt,
      editedAt: msg.editedAt,
      postedByAdmin: Boolean(msg.postedAsAdminUserId),
      reactions: aggregateReactions(msg.reactions, viewerMemberId),
    };
  }
}
