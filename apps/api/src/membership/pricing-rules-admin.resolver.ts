import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import {
  CreateMembershipPricingRuleInput,
  UpdateMembershipPricingRuleInput,
} from './dto/membership-pricing-rule.input';
import { MembershipPricingRuleGraph } from './models/membership-pricing-rule.model';
import { PricingRulesAdminService } from './pricing-rules-admin.service';

/**
 * Resolver admin pour gérer les règles de remise (pattern-based).
 * Restreint aux admins du club (ClubAdminRoleGuard inclut TREASURER).
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
export class PricingRulesAdminResolver {
  constructor(private readonly service: PricingRulesAdminService) {}

  @Query(() => [MembershipPricingRuleGraph], {
    name: 'clubMembershipPricingRules',
  })
  async clubMembershipPricingRules(
    @CurrentClub() club: Club,
  ): Promise<MembershipPricingRuleGraph[]> {
    const rows = await this.service.listAll(club.id);
    return rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      label: r.label,
      isActive: r.isActive,
      priority: r.priority,
      configJson: JSON.stringify(r.configJson),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  @Mutation(() => MembershipPricingRuleGraph, {
    name: 'createClubMembershipPricingRule',
  })
  async createClubMembershipPricingRule(
    @CurrentClub() club: Club,
    @Args('input') input: CreateMembershipPricingRuleInput,
  ): Promise<MembershipPricingRuleGraph> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.configJson);
    } catch {
      throw new BadRequestException(
        'configJson doit être un JSON valide.',
      );
    }
    const r = await this.service.create(club.id, {
      pattern: input.pattern,
      label: input.label,
      isActive: input.isActive,
      priority: input.priority,
      configJson: parsed,
    });
    return {
      id: r.id,
      pattern: r.pattern,
      label: r.label,
      isActive: r.isActive,
      priority: r.priority,
      configJson: JSON.stringify(r.configJson),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  @Mutation(() => MembershipPricingRuleGraph, {
    name: 'updateClubMembershipPricingRule',
  })
  async updateClubMembershipPricingRule(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMembershipPricingRuleInput,
  ): Promise<MembershipPricingRuleGraph> {
    let parsed: unknown | undefined;
    if (input.configJson !== undefined) {
      try {
        parsed = JSON.parse(input.configJson);
      } catch {
        throw new BadRequestException(
          'configJson doit être un JSON valide.',
        );
      }
    }
    const r = await this.service.update(club.id, {
      id: input.id,
      label: input.label,
      isActive: input.isActive,
      priority: input.priority,
      configJson: parsed,
    });
    return {
      id: r.id,
      pattern: r.pattern,
      label: r.label,
      isActive: r.isActive,
      priority: r.priority,
      configJson: JSON.stringify(r.configJson),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  @Mutation(() => Boolean, { name: 'deleteClubMembershipPricingRule' })
  async deleteClubMembershipPricingRule(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.service.delete(club.id, id);
  }
}
