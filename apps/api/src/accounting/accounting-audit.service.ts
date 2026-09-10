import { Injectable } from '@nestjs/common';
import { AccountingAuditAction } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Log d'audit immuable append-only pour la compta. Toute mutation sur
 * une écriture (création, modification, verrouillage, annulation,
 * contre-passation, export, clôture annuelle) génère un enregistrement.
 *
 * Aucune mutation UPDATE/DELETE sur les logs (contrainte applicative,
 * à coupler avec un trigger Postgres en v2 pour blindage).
 */
@Injectable()
export class AccountingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `tx` : la transaction de l'appelant, OBLIGATOIRE quand l'écriture
   * journalisée y est encore invisible du reste de la base. Sans elle, la
   * clé étrangère vers l'écriture non commitée échoue (P2003) et fait
   * annuler toute la transaction — vu sur staging le 2026-09-10 à la
   * première saisie d'un chèque hors facture.
   */
  async log(
    params: {
      clubId: string;
      entryId?: string | null;
      userId: string;
      action: AccountingAuditAction;
      diffJson?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).accountingAuditLog.create({
      data: {
        clubId: params.clubId,
        entryId: params.entryId ?? null,
        userId: params.userId,
        action: params.action,
        diffJson: (params.diffJson as object | undefined) ?? undefined,
        metadata: (params.metadata as object | undefined) ?? undefined,
      },
    });
  }

  async listForEntry(clubId: string, entryId: string) {
    return this.prisma.accountingAuditLog.findMany({
      where: { clubId, entryId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForClub(clubId: string, limit = 200) {
    return this.prisma.accountingAuditLog.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
