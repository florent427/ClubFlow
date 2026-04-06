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
import { PostChatMessageInput } from './dto/post-chat-message.input';
import { ChatMessageGql } from './models/chat-message-gql.model';
import {
  ChatMemberSnippetGraph,
  ChatRoomGql,
  ChatRoomMemberGql,
} from './models/chat-room-gql.model';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

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
    return rows.map((r) => this.toRoomGql(r));
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
    return rows.map((m) => this.toMessageGql(m));
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
    return this.toRoomGql(room);
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
    return this.toRoomGql(room);
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
    );
    const gql = this.toMessageGql(msg);
    this.gateway.emitChatMessage(input.roomId, {
      id: gql.id,
      roomId: gql.roomId,
      body: gql.body,
      createdAt: gql.createdAt,
      sender: gql.sender,
    });
    return gql;
  }

  private toRoomGql(
    row: Awaited<ReturnType<MessagingService['listRoomsForMember']>>[0],
  ): ChatRoomGql {
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
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
    };
  }

  private toMessageGql(msg: {
    id: string;
    roomId: string;
    body: string;
    createdAt: Date;
    sender: {
      id: string;
      pseudo: string | null;
      firstName: string;
      lastName: string;
    };
  }): ChatMessageGql {
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
    };
  }
}
