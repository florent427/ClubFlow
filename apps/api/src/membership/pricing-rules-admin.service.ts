import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipPricingRule,
  MembershipPricingRulePattern,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { validateRuleConfig } from './pricing-rules-engine.service';

export interface CreatePricingRuleInput {
  pattern: MembershipPricingRulePattern;
  label: string;
  isActive?: boolean;
  priority?: number;
  /** Doit matcher le schéma du pattern (validé via Zod-like). */
  configJson: unknown;
}

export interface UpdatePricingRuleInput {
  id: string;
  label?: string;
  isActive?: boolean;
  priority?: number;
  configJson?: unknown;
}

/**
 * Service CRUD admin pour les règles de tarification (`MembershipPricingRule`).
 * Validation stricte du `configJson` à chaque write : si invalide pour
 * le pattern, refuse avec une erreur explicite.
 */
@Injectable()
export class PricingRulesAdminService {
  private readonly logger = new Logger(PricingRulesAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listAll(clubId: string): Promise<MembershipPricingRule[]> {
    return this.prisma.membershipPricingRule.findMany({
      where: { clubId },
      orderBy: [{ priority: 'asc' }, { label: 'asc' }],
    });
  }

  async getById(clubId: string, id: string): Promise<MembershipPricingRule> {
    const row = await this.prisma.membershipPricingRule.findFirst({
      where: { id, clubId },
    });
    if (!row) throw new NotFoundException('Règle introuvable.');
    return row;
  }

  async create(
    clubId: string,
    input: CreatePricingRuleInput,
  ): Promise<MembershipPricingRule> {
    const label = input.label.trim();
    if (!label) throw new BadRequestException('Libellé requis.');
    // Validation stricte du configJson selon le pattern
    const cleaned = validateRuleConfig(input.pattern, input.configJson);
    return this.prisma.membershipPricingRule.create({
      data: {
        clubId,
        pattern: input.pattern,
        label,
        isActive: input.isActive ?? true,
        priority: input.priority ?? 0,
        configJson: cleaned as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(
    clubId: string,
    input: UpdatePricingRuleInput,
  ): Promise<MembershipPricingRule> {
    const existing = await this.getById(clubId, input.id);
    const data: Prisma.MembershipPricingRuleUpdateInput = {};
    if (input.label !== undefined) {
      const lbl = input.label.trim();
      if (!lbl) throw new BadRequestException('Libellé requis.');
      data.label = lbl;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.configJson !== undefined) {
      const cleaned = validateRuleConfig(existing.pattern, input.configJson);
      data.configJson = cleaned as unknown as Prisma.InputJsonValue;
    }
    return this.prisma.membershipPricingRule.update({
      where: { id: existing.id },
      data,
    });
  }

  async delete(clubId: string, id: string): Promise<boolean> {
    const existing = await this.getById(clubId, id);
    await this.prisma.membershipPricingRule.delete({ where: { id: existing.id } });
    return true;
  }
}
