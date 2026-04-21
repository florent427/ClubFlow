import { UseGuards } from '@nestjs/common';
import {
  Args,
  Context,
  ID,
  Int,
  Mutation,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { Request } from 'express';
import type { Club, MembershipRole } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import type { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from './agent.service';
import { AgentPendingActionsService } from './pending-actions.service';
import type { AgentRole } from './classifications';
import {
  ConfirmAgentPendingActionInput,
  SendAgentMessageInput,
  StartAgentConversationInput,
} from './dto/agent-inputs';
import {
  AgentAuditEntryGraph,
  AgentConfirmResultGraph,
  AgentConversationGraph,
  AgentMessageGraph,
  AgentPendingActionGraph,
  AgentTurnResultGraph,
} from './models/agent-models';

/**
 * Resolver de l'agent conversationnel. Expose :
 *  - Gestion des conversations (create / list / messages)
 *  - Envoi d'un message user → réponse LLM (+ tool calls éventuels)
 *  - Confirmation / refus d'une pending action
 *  - Audit (admin du club uniquement)
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard)
export class AgentResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly pending: AgentPendingActionsService,
  ) {}

  private async resolveUserRoles(
    userId: string,
    clubId: string,
  ): Promise<AgentRole[]> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true },
    });
    if (!membership) return [];
    // Mappe le rôle unique en array (pour symmetry avec les classifications).
    const role = membership.role as MembershipRole;
    const allowedSet: AgentRole[] = [];
    if (['CLUB_ADMIN', 'BOARD', 'TREASURER', 'COMM_MANAGER', 'MEMBER'].includes(role)) {
      allowedSet.push(role as AgentRole);
    }
    return allowedSet;
  }

  private extractJwt(ctx: { req: Request }): string {
    const header = ctx.req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new Error('JWT absent de la requête.');
    }
    return header.slice(7);
  }

  // ==================== Queries ====================

  @Query(() => [AgentConversationGraph], { name: 'agentConversations' })
  async agentConversations(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentConversationGraph[]> {
    return this.agent.listConversations(club.id, user.userId);
  }

  @Query(() => [AgentMessageGraph], { name: 'agentMessages' })
  async agentMessages(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('conversationId', { type: () => ID }) conversationId: string,
  ): Promise<AgentMessageGraph[]> {
    return this.agent.listMessages(club.id, user.userId, conversationId);
  }

  @Query(() => [AgentPendingActionGraph], { name: 'agentPendingActions' })
  async agentPendingActions(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('conversationId', { type: () => ID }) conversationId: string,
  ): Promise<AgentPendingActionGraph[]> {
    const rows = await this.pending.getPending(
      club.id,
      user.userId,
      conversationId,
    );
    return rows.map((r) => ({
      id: r.id,
      toolName: r.toolName,
      riskLevel: r.riskLevel,
      previewText: r.previewText,
      expiresAt: r.expiresAt,
      argsPreview: JSON.stringify(r.argsJson, null, 2).slice(0, 2000),
    }));
  }

  @Query(() => [AgentAuditEntryGraph], { name: 'agentAuditLog' })
  async agentAuditLog(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<AgentAuditEntryGraph[]> {
    // Réservé aux admins du club.
    const roles = await this.resolveUserRoles(user.userId, club.id);
    if (!roles.includes('CLUB_ADMIN') && !roles.includes('BOARD')) {
      throw new Error('Audit réservé aux administrateurs du club.');
    }
    return this.agent.auditLog(club.id, limit ?? 100);
  }

  // ==================== Mutations ====================

  @Mutation(() => AgentConversationGraph)
  async startAgentConversation(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: StartAgentConversationInput,
  ): Promise<AgentConversationGraph> {
    this.agent.assertGlobalNotKilled();
    await this.agent.assertClubEnabled(club.id);
    const conv = await this.agent.createConversation(
      club.id,
      user.userId,
      input.title ?? null,
    );
    const row = await this.prisma.agentConversation.findUnique({
      where: { id: conv.id },
    });
    if (!row) throw new Error('Conversation non créée.');
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Mutation(() => AgentTurnResultGraph)
  async sendAgentMessage(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Context() ctx: { req: Request },
    @Args('input') input: SendAgentMessageInput,
  ): Promise<AgentTurnResultGraph> {
    const userJwt = this.extractJwt(ctx);
    const userRoles = await this.resolveUserRoles(user.userId, club.id);
    const res = await this.agent.handleUserTurn({
      clubId: club.id,
      userId: user.userId,
      userJwt,
      userRoles,
      conversationId: input.conversationId,
      userMessage: input.content,
      attachmentIds: input.attachmentIds,
    });
    return {
      assistantMessageId: res.assistantMessageId,
      assistantText: res.assistantText,
      toolCalls: res.toolCalls.map((t) => ({
        toolName: t.toolName,
        status: t.status,
        resultSummary: t.resultSummary ?? null,
        pendingActionId: t.pendingActionId ?? null,
        previewText: t.previewText ?? null,
        errorMessage: t.errorMessage ?? null,
      })),
      totalInputTokens: res.totalInputTokens,
      totalOutputTokens: res.totalOutputTokens,
      hasPendingActions: res.hasPendingActions,
    };
  }

  @Mutation(() => AgentConfirmResultGraph)
  async confirmAgentPendingAction(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Context() ctx: { req: Request },
    @Args('input') input: ConfirmAgentPendingActionInput,
  ): Promise<AgentConfirmResultGraph> {
    const userJwt = this.extractJwt(ctx);
    const userRoles = await this.resolveUserRoles(user.userId, club.id);
    const res = await this.agent.confirmPendingAction({
      clubId: club.id,
      userId: user.userId,
      userJwt,
      userRoles,
      pendingActionId: input.pendingActionId,
      confirmed: input.confirmed,
    });
    return {
      toolName: res.toolName,
      success: res.success,
      error: res.error ?? null,
      conversationId: res.conversationId,
    };
  }
}
