import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { RecordManualPaymentInput } from './dto/record-manual-payment.input';
import { UpsertClubPricingRuleInput } from './dto/upsert-pricing-rule.input';
import { ClubPricingRuleGraph } from './models/club-pricing-rule.model';
import { InvoiceGraph } from './models/invoice.model';
import { PaymentGraph } from './models/payment.model';
import { PaymentsService } from './payments.service';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class PaymentsResolver {
  constructor(private readonly payments: PaymentsService) {}

  @Query(() => [InvoiceGraph], { name: 'clubInvoices' })
  async clubInvoices(@CurrentClub() club: Club): Promise<InvoiceGraph[]> {
    const rows = await this.payments.listInvoices(club.id);
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      familyId: r.familyId,
      householdGroupId: r.householdGroupId ?? null,
      clubSeasonId: r.clubSeasonId ?? null,
      label: r.label,
      baseAmountCents: r.baseAmountCents,
      amountCents: r.amountCents,
      status: r.status,
      lockedPaymentMethod: r.lockedPaymentMethod ?? null,
      dueAt: r.dueAt,
      totalPaidCents: r.totalPaidCents,
      balanceCents: r.balanceCents,
    }));
  }

  @Query(() => [ClubPricingRuleGraph], { name: 'clubPricingRules' })
  async clubPricingRules(
    @CurrentClub() club: Club,
  ): Promise<ClubPricingRuleGraph[]> {
    const rows = await this.payments.listPricingRules(club.id);
    return rows.map((r) => ({
      id: r.id,
      method: r.method,
      adjustmentType: r.adjustmentType,
      adjustmentValue: r.adjustmentValue,
    }));
  }

  @Mutation(() => InvoiceGraph)
  async createClubInvoice(
    @CurrentClub() club: Club,
    @Args('input') input: CreateInvoiceInput,
  ): Promise<InvoiceGraph> {
    const row = await this.payments.createInvoice(club.id, input);
    return {
      id: row.id,
      clubId: row.clubId,
      familyId: row.familyId,
      householdGroupId: row.householdGroupId ?? null,
      clubSeasonId: row.clubSeasonId ?? null,
      label: row.label,
      baseAmountCents: row.baseAmountCents,
      amountCents: row.amountCents,
      status: row.status,
      lockedPaymentMethod: row.lockedPaymentMethod ?? null,
      dueAt: row.dueAt,
      totalPaidCents: 0,
      balanceCents: row.amountCents,
    };
  }

  @Mutation(() => ClubPricingRuleGraph)
  upsertClubPricingRule(
    @CurrentClub() club: Club,
    @Args('input') input: UpsertClubPricingRuleInput,
  ): Promise<ClubPricingRuleGraph> {
    return this.payments.upsertPricingRule(club.id, input);
  }

  @Mutation(() => PaymentGraph)
  async recordClubManualPayment(
    @CurrentClub() club: Club,
    @Args('input') input: RecordManualPaymentInput,
  ): Promise<PaymentGraph> {
    const p = await this.payments.recordManualPayment(club.id, input);
    return {
      id: p.id,
      invoiceId: p.invoiceId,
      amountCents: p.amountCents,
      method: p.method,
      externalRef: p.externalRef,
      paidByMemberId: p.paidByMemberId ?? null,
      createdAt: p.createdAt,
    };
  }
}
