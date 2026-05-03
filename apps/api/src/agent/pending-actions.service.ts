import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { AgentRiskLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AGENT_GLOBAL_LIMITS } from './limits.config';

/**
 * Gère les PendingActions — les tool calls DESTRUCTIVE/GUARDED en attente
 * d'une confirmation humaine via bouton rouge (pas via texte).
 *
 * Chaque action est signée HMAC avec `AGENT_HMAC_KEY` pour anti-replay.
 * Expiration auto après 5 min.
 */
@Injectable()
export class AgentPendingActionsService {
  constructor(private readonly prisma: PrismaService) {}

  private hmacKey(): string {
    return (
      process.env.AGENT_HMAC_KEY ??
      process.env.AI_SECRETS_KEY ??
      'dev-agent-hmac-fallback-change-me'
    );
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.hmacKey()).update(payload).digest('hex');
  }

  async create(opts: {
    clubId: string;
    userId: string;
    conversationId: string;
    toolName: string;
    args: Record<string, unknown>;
    riskLevel: AgentRiskLevel;
    previewText: string;
  }): Promise<{ id: string; previewText: string }> {
    const expiresAt = new Date(
      Date.now() + AGENT_GLOBAL_LIMITS.pendingActionTtlMinutes * 60_000,
    );
    const payload = `${opts.clubId}:${opts.userId}:${opts.conversationId}:${opts.toolName}:${JSON.stringify(opts.args)}:${expiresAt.toISOString()}`;
    const signature = this.sign(payload);

    const row = await this.prisma.agentPendingAction.create({
      data: {
        clubId: opts.clubId,
        userId: opts.userId,
        conversationId: opts.conversationId,
        toolName: opts.toolName,
        argsJson: opts.args as object,
        riskLevel: opts.riskLevel,
        previewText: opts.previewText,
        signature,
        expiresAt,
      },
    });
    return { id: row.id, previewText: row.previewText };
  }

  async getPending(
    clubId: string,
    userId: string,
    conversationId: string,
  ): Promise<
    Array<{
      id: string;
      toolName: string;
      previewText: string;
      riskLevel: AgentRiskLevel;
      argsJson: unknown;
      expiresAt: Date;
    }>
  > {
    const rows = await this.prisma.agentPendingAction.findMany({
      where: {
        clubId,
        userId,
        conversationId,
        status: 'PENDING_CONFIRMATION',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      toolName: r.toolName,
      previewText: r.previewText,
      riskLevel: r.riskLevel,
      argsJson: r.argsJson,
      expiresAt: r.expiresAt,
    }));
  }

  /**
   * Consomme une pending action : vérifie la signature, le TTL, l'ownership,
   * et change le statut en EXECUTED (ou REFUSED selon le flag).
   * Retourne les args validés pour que l'appelant puisse exécuter.
   */
  async consume(
    id: string,
    clubId: string,
    userId: string,
    confirmed: boolean,
  ): Promise<{
    toolName: string;
    args: Record<string, unknown>;
    riskLevel: AgentRiskLevel;
    conversationId: string;
  }> {
    const row = await this.prisma.agentPendingAction.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Action introuvable.');
    if (row.clubId !== clubId || row.userId !== userId) {
      throw new BadRequestException('Ownership mismatch.');
    }
    if (row.status !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException(`Action déjà ${row.status}.`);
    }
    if (row.expiresAt < new Date()) {
      await this.prisma.agentPendingAction.update({
        where: { id },
        data: { status: 'FAILED', resolvedAt: new Date() },
      });
      throw new BadRequestException(
        `Action expirée (TTL ${AGENT_GLOBAL_LIMITS.pendingActionTtlMinutes} min).`,
      );
    }
    // Vérifie la signature (anti-replay même si la DB est manipulée).
    const expectedPayload = `${row.clubId}:${row.userId}:${row.conversationId}:${row.toolName}:${JSON.stringify(row.argsJson)}:${row.expiresAt.toISOString()}`;
    const expectedSig = this.sign(expectedPayload);
    if (expectedSig !== row.signature) {
      await this.prisma.agentPendingAction.update({
        where: { id },
        data: { status: 'FAILED', resolvedAt: new Date() },
      });
      throw new BadRequestException('Signature invalide (anti-replay).');
    }

    await this.prisma.agentPendingAction.update({
      where: { id },
      data: {
        status: confirmed ? 'EXECUTED' : 'REFUSED',
        resolvedAt: new Date(),
      },
    });

    if (!confirmed) {
      throw new BadRequestException('Action refusée par l\'utilisateur.');
    }

    return {
      toolName: row.toolName,
      args: row.argsJson as Record<string, unknown>,
      riskLevel: row.riskLevel,
      conversationId: row.conversationId,
    };
  }
}
