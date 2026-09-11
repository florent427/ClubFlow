import { Injectable, Logger } from '@nestjs/common';
import { CategorizationDirection, CategorizationRuleSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { learnedPatternFor } from './categorization-rules';

/**
 * Ce qu'une validation enseigne au club (ADR-0014 §5) : la règle qui a
 * servi gagne un point, une décision prise sans règle en crée une. C'est ce
 * qui fait qu'un club paie l'IA une fois par fournisseur, pas une fois par
 * mois.
 *
 * Service à part, et non méthode de la catégorisation, parce que les deux
 * chemins de validation y passent : l'écran de rapprochement et la file de
 * revue comptable. Il ne dépend que de la base, donc personne ne tourne en
 * rond pour l'appeler.
 */
@Injectable()
export class CategorizationLearningService {
  private readonly logger = new Logger(CategorizationLearningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async learnFrom(
    clubId: string,
    userId: string | null,
    line: { id: string; label: string; amountCents: number; ruleId: string | null },
    accountCode: string,
    projectId: string | null,
  ): Promise<void> {
    if (line.ruleId) {
      const rule = await this.prisma.accountingCategorizationRule.findFirst({
        where: { id: line.ruleId, clubId },
        select: { id: true, accountCode: true },
      });
      if (rule && rule.accountCode === accountCode) {
        await this.prisma.accountingCategorizationRule.update({
          where: { id: rule.id },
          data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
        });
        return;
      }
      // Le compte a été corrigé : la règle ne dit plus le vrai. On la laisse
      // en place et on apprend la nouvelle décision ci-dessous.
    }
    const pattern = learnedPatternFor(line.label);
    if (!pattern) return;
    const direction =
      line.amountCents >= 0 ? CategorizationDirection.CREDIT : CategorizationDirection.DEBIT;
    await this.prisma.accountingCategorizationRule.upsert({
      where: { clubId_pattern_direction: { clubId, pattern, direction } },
      create: {
        clubId,
        pattern,
        matchKind: 'CONTAINS',
        direction,
        accountCode,
        projectId,
        source: CategorizationRuleSource.LEARNED,
        hitCount: 1,
        lastHitAt: new Date(),
        createdByUserId: userId,
      },
      update: {
        accountCode,
        projectId,
        isActive: true,
        hitCount: { increment: 1 },
        lastHitAt: new Date(),
      },
    });
    this.logger.log(`[ligne ${line.id}] règle « ${pattern} » (${direction}) → ${accountCode}`);
  }
}
