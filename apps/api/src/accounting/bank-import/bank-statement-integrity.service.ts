import { Injectable, NotFoundException } from '@nestjs/common';
import { BankStatementStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { checkStatementIntegrity, deriveStatementStatus } from './statement-integrity';

/**
 * Chaînage et contrôle d'intégrité des relevés en base (ADR-0014 §4) :
 * partagé entre l'import OFX/CSV, la lecture PDF et les corrections. Un
 * relevé en échec ou en cours de lecture ne compte ni pour le chaînage ni
 * pour le chevauchement.
 */
@Injectable()
export class BankStatementIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Le relevé qui précède une période sur un compte. */
  async previousStatement(
    clubId: string,
    financialAccountId: string,
    periodStart: Date,
    excludeId: string | null,
  ): Promise<{ id: string; closingBalanceCents: number } | null> {
    return this.prisma.bankStatement.findFirst({
      where: {
        clubId,
        financialAccountId,
        status: { notIn: [BankStatementStatus.FAILED, BankStatementStatus.PARSING] },
        periodEnd: { lt: periodStart },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: { periodEnd: 'desc' },
      select: { id: true, closingBalanceCents: true },
    });
  }

  /** Recalcule intégrité, chaînage et statut d'un relevé, après toute édition. */
  async recompute(clubId: string, statementId: string): Promise<void> {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, clubId },
      include: {
        financialAccount: { select: { openingBalanceCents: true } },
        lines: { select: { amountCents: true, status: true, readingAgreement: true } },
      },
    });
    if (!st) throw new NotFoundException('Relevé introuvable');
    if (st.status === BankStatementStatus.PARSING || st.status === BankStatementStatus.FAILED) {
      // Rien à contrôler tant que le relevé n'a pas été lu.
      return;
    }
    const previous = await this.previousStatement(clubId, st.financialAccountId, st.periodStart, st.id);
    const previousClosing = previous
      ? previous.closingBalanceCents
      : (st.financialAccount.openingBalanceCents ?? null);
    const integrity = checkStatementIntegrity({
      openingBalanceCents: st.openingBalanceCents,
      closingBalanceCents: st.closingBalanceCents,
      lineAmounts: st.lines.map((l) => l.amountCents),
      previousClosingCents: previousClosing,
    });
    await this.prisma.bankStatement.update({
      where: { id: st.id },
      data: {
        integrityDeltaCents: integrity.deltaCents,
        chainOk: integrity.chainOk,
        chainExpectedCents: integrity.chainExpectedCents,
        previousStatementId: previous?.id ?? null,
        lineCount: st.lines.length,
        status: deriveStatementStatus(
          integrity,
          st.lines.map((l) => l.status),
          { unresolvedDivergences: st.lines.filter((l) => !l.readingAgreement).length },
        ),
      },
    });
  }

  /**
   * Après l'arrivée d'un relevé (import, lecture, correction des soldes) :
   * le premier relevé qui le suit sur le compte se chaîne désormais sur lui.
   * Sans ce recalcul, un relevé déposé APRÈS un relevé plus récent laissait
   * celui-ci chaîné sur le solde d'ouverture du compte (constaté sur
   * staging le 2026-09-11 : CSV d'octobre déposé avant le PDF de septembre).
   */
  async rechainFollowing(
    clubId: string,
    financialAccountId: string,
    periodEnd: Date,
    excludeId: string,
  ): Promise<void> {
    const next = await this.prisma.bankStatement.findFirst({
      where: {
        clubId,
        financialAccountId,
        id: { not: excludeId },
        status: { notIn: [BankStatementStatus.FAILED, BankStatementStatus.PARSING] },
        periodStart: { gt: periodEnd },
      },
      orderBy: { periodStart: 'asc' },
      select: { id: true },
    });
    if (next) await this.recompute(clubId, next.id);
  }
}
