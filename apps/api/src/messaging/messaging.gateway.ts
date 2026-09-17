import { BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Interval } from '@nestjs/schedule';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { MemberStatus } from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/jwt.strategy';
import { FamiliesService } from '../families/families.service';
import { MediaUrlSignerService } from '../media/media-url-signer.service';

export type ChatSocketData = {
  userId: string;
  clubId: string;
  memberId: string;
};

/**
 * `client.data` d'une socket du chat. `ready` se résout une fois l'accès
 * contrôlé : `handleConnection` est asynchrone, et les clients émettent
 * `joinRoom` dès l'événement `connect`, avant la fin du contrôle.
 */
type ChatSocketState = {
  ready?: Promise<ChatSocketData | null>;
  member?: ChatSocketData;
};

/**
 * Au plus ce délai s'écoule entre la perte de l'accès (membre désactivé,
 * profil retiré du compte, module coupé) et la coupure d'une connexion déjà
 * ouverte. Le jeton, lui, reste valable 7 jours.
 */
export const CHAT_SOCKET_REVALIDATION_MS = 60_000;

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
  server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly signer: MediaUrlSignerService,
    private readonly families: FamiliesService,
  ) {}

  handleConnection(client: Socket): void {
    const state = client.data as ChatSocketState;
    state.ready = this.admit(client);
  }

  /**
   * Mêmes contrôles que les requêtes GraphQL de la messagerie
   * (`ViewerActiveProfileGuard`, module MESSAGING) : un jeton valide ne suffit
   * pas, il reste valable 7 jours après la désactivation d'un membre.
   */
  private async admit(client: Socket): Promise<ChatSocketData | null> {
    const token = client.handshake.auth?.token as string | undefined;
    const clubId = client.handshake.auth?.clubId as string | undefined;
    if (!token || !clubId) {
      client.disconnect(true);
      return null;
    }
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token);
    } catch (e) {
      this.logger.warn(`WS auth failed: ${String(e)}`);
      client.disconnect(true);
      return null;
    }
    const memberId = payload.activeProfileMemberId;
    if (!memberId) {
      client.disconnect(true);
      return null;
    }
    const ctx: ChatSocketData = { userId: payload.sub, clubId, memberId };
    let allowed = false;
    try {
      allowed = await this.canUseChat(ctx);
    } catch (e) {
      // Base indisponible : on refuse plutôt que d'ouvrir le salon sans contrôle.
      this.logger.warn(`WS access check failed: ${String(e)}`);
    }
    if (!allowed) {
      client.disconnect(true);
      return null;
    }
    (client.data as ChatSocketState).member = ctx;
    return ctx;
  }

  /**
   * Faux si le membre n'est plus actif dans ce club, si le compte n'a plus ce
   * profil, ou si le club a coupé la messagerie. Lève si la base ne répond pas.
   */
  private async canUseChat(ctx: ChatSocketData): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      where: {
        id: ctx.memberId,
        clubId: ctx.clubId,
        status: MemberStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!member) return false;
    const messaging = await this.prisma.clubModule.findUnique({
      where: {
        clubId_moduleCode: {
          clubId: ctx.clubId,
          moduleCode: ModuleCode.MESSAGING,
        },
      },
      select: { enabled: true },
    });
    if (!messaging?.enabled) return false;
    try {
      await this.families.assertViewerHasProfile(ctx.userId, ctx.memberId);
    } catch (e) {
      if (e instanceof BadRequestException) return false;
      throw e;
    }
    return true;
  }

  /**
   * Coupe les connexions ouvertes qui ont perdu l'accès depuis leur ouverture.
   * Une erreur de lecture ne coupe personne : le passage suivant recommence.
   */
  @Interval(CHAT_SOCKET_REVALIDATION_MS)
  async revalidateConnectedSockets(): Promise<void> {
    if (!this.server) return;
    let sockets: Awaited<ReturnType<Namespace['fetchSockets']>>;
    try {
      sockets = await this.server.fetchSockets();
    } catch (e) {
      this.logger.warn(`WS revalidation skipped: ${String(e)}`);
      return;
    }
    const verdicts = new Map<string, Promise<boolean | null>>();
    for (const socket of sockets) {
      const ctx = (socket.data as ChatSocketState | undefined)?.member;
      if (!ctx) continue;
      const key = `${ctx.userId}|${ctx.clubId}|${ctx.memberId}`;
      let verdict = verdicts.get(key);
      if (!verdict) {
        verdict = this.canUseChat(ctx).catch((e) => {
          this.logger.warn(`WS revalidation failed for ${key}: ${String(e)}`);
          return null;
        });
        verdicts.set(key, verdict);
      }
      if ((await verdict) === false) {
        socket.disconnect(true);
      }
    }
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<void> {
    const ctx = await (client.data as ChatSocketState).ready;
    if (!ctx || !payload?.roomId) {
      return;
    }
    const m = await this.prisma.chatRoomMember.findFirst({
      where: {
        memberId: ctx.memberId,
        member: { status: MemberStatus.ACTIVE },
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
      body: string | null;
      createdAt: Date;
      parentMessageId: string | null;
      sender: {
        id: string;
        pseudo: string | null;
        firstName: string;
        lastName: string;
        photoUrl?: string | null;
      };
      attachments?: Array<{
        id: string;
        kind: string;
        mediaUrl: string;
        thumbnailUrl: string | null;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        durationMs: number | null;
      }>;
    },
  ): void {
    // L'avatar part vers un `<img>` / `<Image>` client, qui n'enverra aucun
    // en-tête : il lui faut une URL signée, comme sur le chemin GraphQL.
    // Le middleware de champ ne voit pas ce payload — il ne traverse aucun
    // modèle GraphQL —, d'où la signature explicite ici.
    this.server.to(roomChannel(roomId)).emit('chat:message', {
      ...payload,
      sender: {
        ...payload.sender,
        photoUrl: this.signer.signUrl(payload.sender.photoUrl),
      },
    });
  }

  /**
   * Notifie le salon qu'une réaction a été basculée. Le client met à jour
   * localement les compteurs sans recharger toute la liste.
   */
  emitReactionUpdate(
    roomId: string,
    payload: {
      messageId: string;
      memberId: string;
      emoji: string;
      reacted: boolean;
      count: number;
    },
  ): void {
    this.server.to(roomChannel(roomId)).emit('chat:reaction', payload);
  }

  /**
   * Notifie le salon qu'un thread a évolué (compteur replyCount).
   */
  emitThreadUpdate(
    roomId: string,
    payload: {
      parentMessageId: string;
      replyCount: number;
      lastReplyAt: Date | null;
    },
  ): void {
    this.server.to(roomChannel(roomId)).emit('chat:thread', payload);
  }

  /**
   * Notifie le salon qu'un message a été édité (clients re-fetchent
   * le contenu pour afficher la nouvelle version + le tag "modifié").
   */
  emitMessageEdited(
    roomId: string,
    payload: { id: string; body: string | null; editedAt: Date },
  ): void {
    this.server.to(roomChannel(roomId)).emit('chat:message:edit', payload);
  }

  /**
   * Notifie le salon qu'un message a été supprimé (soft delete).
   */
  emitMessageDeleted(roomId: string, payload: { id: string }): void {
    this.server.to(roomChannel(roomId)).emit('chat:message:delete', payload);
  }
}
