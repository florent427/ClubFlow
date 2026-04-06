import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/jwt.strategy';

export type ChatSocketData = {
  userId: string;
  clubId: string;
  memberId: string;
};

function roomChannel(roomId: string): string {
  return `chat:${roomId}`;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class MessagingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(MessagingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    const clubId = client.handshake.auth?.clubId as string | undefined;
    if (!token || !clubId) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      const memberId = payload.activeProfileMemberId;
      if (!memberId) {
        client.disconnect(true);
        return;
      }
      (client.data as ChatSocketData) = {
        userId: payload.sub,
        clubId,
        memberId,
      };
    } catch (e) {
      this.logger.warn(`WS auth failed: ${String(e)}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const ctx = client.data as ChatSocketData | Record<string, never>;
    if (!('memberId' in ctx) || !payload?.roomId) {
      return;
    }
    const m = await this.prisma.chatRoomMember.findFirst({
      where: {
        memberId: ctx.memberId,
        room: { id: payload.roomId, clubId: ctx.clubId },
      },
    });
    if (!m) {
      return;
    }
    await client.join(roomChannel(payload.roomId));
  }

  @SubscribeMessage('leaveRoom')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    if (!payload?.roomId) return;
    await client.leave(roomChannel(payload.roomId));
  }

  emitChatMessage(
    roomId: string,
    payload: {
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
    },
  ): void {
    this.server.to(roomChannel(roomId)).emit('chat:message', payload);
  }
}
