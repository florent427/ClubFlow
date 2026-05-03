import { Injectable, Logger } from '@nestjs/common';
import { AiUsageFeature } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface BudgetStatus {
  /** Vrai si un nouvel appel IA peut être effectué (hard cap non atteint). */
  allowed: boolean;
  /** Vrai si ≥ 80 % du budget mensuel utilisé (notif admin). */
  softCapReached: boolean;
  /** Vrai si ≥ 100 % du budget mensuel utilisé. */
  hardCapReached: boolean;
  /** Dépense cumulée du mois en cours (centimes). */
  usageCents: number;
  /** Budget configuré (centimes) ou null = illimité. */
  budgetCents: number | null;
  /** Budget effectif (avec override trésorier si présent). */
  effectiveBudgetCents: number | null;
}

/**
 * Service de gestion du budget IA mensuel par club.
 *
 * Tracking : table `AiMonthlyUsage` (clubId, yearMonth) mise à jour à
 * chaque appel. Hard cap à 100 % → bloque l'appel, soft cap à 80 % →
 * notif admin (TODO v1.5 : réellement envoyer une notif).
 *
 * Override : `Club.aiMonthlyBudgetOverrideCents` permet au trésorier de
 * débloquer temporairement l'IA en fin de mois (ex: saisie critique).
 */
@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger(AiBudgetService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toYearMonth(date = new Date()): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  async checkBudget(clubId: string): Promise<BudgetStatus> {
    const [club, usage] = await Promise.all([
      this.prisma.club.findUnique({
        where: { id: clubId },
        select: {
          aiMonthlyBudgetCents: true,
          aiMonthlyBudgetOverrideCents: true,
        },
      }),
      this.prisma.aiMonthlyUsage.findUnique({
        where: {
          clubId_yearMonth: {
            clubId,
            yearMonth: this.toYearMonth(),
          },
        },
        select: { totalCostCents: true },
      }),
    ]);
    const budget = club?.aiMonthlyBudgetCents ?? null;
    const override = club?.aiMonthlyBudgetOverrideCents ?? null;
    const effective = override ?? budget;
    const usageCents = usage?.totalCostCents ?? 0;

    const softCapReached =
      effective !== null && usageCents >= Math.floor(effective * 0.8);
    const hardCapReached = effective !== null && usageCents >= effective;
    const allowed = !hardCapReached;

    return {
      allowed,
      softCapReached,
      hardCapReached,
      usageCents,
      budgetCents: budget,
      effectiveBudgetCents: effective,
    };
  }

  /**
   * Incrémente l'usage mensuel pour un club. À appeler après chaque
   * appel IA réussi (ou échoué mais facturé).
   */
  async incrementUsage(
    clubId: string,
    feature: AiUsageFeature,
    costCents: number,
    inputTokens: number,
    outputTokens: number,
    imagesGenerated = 0,
  ): Promise<void> {
    const yearMonth = this.toYearMonth();
    const existing = await this.prisma.aiMonthlyUsage.findUnique({
      where: { clubId_yearMonth: { clubId, yearMonth } },
    });
    if (!existing) {
      const featureBreakdown = { [feature]: costCents };
      await this.prisma.aiMonthlyUsage.create({
        data: {
          clubId,
          yearMonth,
          totalCostCents: costCents,
          inputTokens: BigInt(inputTokens),
          outputTokens: BigInt(outputTokens),
          imagesGenerated,
          featureBreakdown,
        },
      });
      return;
    }
    const breakdown =
      (existing.featureBreakdown as Record<string, number>) ?? {};
    breakdown[feature] = (breakdown[feature] ?? 0) + costCents;
    await this.prisma.aiMonthlyUsage.update({
      where: { clubId_yearMonth: { clubId, yearMonth } },
      data: {
        totalCostCents: { increment: costCents },
        inputTokens: { increment: BigInt(inputTokens) },
        outputTokens: { increment: BigInt(outputTokens) },
        imagesGenerated: { increment: imagesGenerated },
        featureBreakdown: breakdown,
      },
    });
  }
}
