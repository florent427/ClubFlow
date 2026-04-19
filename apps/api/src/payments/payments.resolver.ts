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
import { InvoiceDetailGraph } from './models/invoice-detail.model';
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
      paidByContactId: p.paidByContactId ?? null,
      createdAt: p.createdAt,
    };
  }

  @Query(() => InvoiceDetailGraph, { name: 'clubInvoice' })
  async clubInvoice(
    @CurrentClub() club: Club,
    @Args('id', { type: () => String }) id: string,
  ): Promise<InvoiceDetailGraph> {
    const inv = await this.payments.getInvoiceDetail(club.id, id);
    return {
      id: inv.id,
      clubId: inv.clubId,
      familyId: inv.familyId,
      familyLabel: inv.family?.label ?? null,
      clubSeasonId: inv.clubSeasonId ?? null,
      clubSeasonLabel: inv.clubSeason?.label ?? null,
      label: inv.label,
      baseAmountCents: inv.baseAmountCents,
      amountCents: inv.amountCents,
      totalPaidCents: inv.totalPaidCents,
      balanceCents: inv.balanceCents,
      status: inv.status,
      lockedPaymentMethod: inv.lockedPaymentMethod ?? null,
      dueAt: inv.dueAt,
      createdAt: inv.createdAt,
      lines: inv.lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        memberId: l.memberId,
        memberFirstName: l.member.firstName,
        memberLastName: l.member.lastName,
        membershipProductId: l.membershipProductId,
        membershipProductLabel: l.membershipProduct?.label ?? null,
        membershipOneTimeFeeId: l.membershipOneTimeFeeId,
        membershipOneTimeFeeLabel: l.membershipOneTimeFee?.label ?? null,
        subscriptionBillingRhythm: l.subscriptionBillingRhythm,
        baseAmountCents: l.baseAmountCents,
        adjustments: l.adjustments.map((a) => ({
          id: a.id,
          stepOrder: a.stepOrder,
          type: a.type,
          amountCents: a.amountCents,
          percentAppliedBp: a.percentAppliedBp,
          reason: a.reason,
        })),
      })),
      payments: inv.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        externalRef: p.externalRef,
        paidByFirstName:
          p.paidByMember?.firstName ?? p.paidByContact?.firstName ?? null,
        paidByLastName:
          p.paidByMember?.lastName ?? p.paidByContact?.lastName ?? null,
        createdAt: p.createdAt,
      })),
    };
  }

  @Mutation(() => InvoiceGraph)
  async issueClubInvoice(
    @CurrentClub() club: Club,
    @Args('id', { type: () => String }) id: string,
  ): Promise<InvoiceGraph> {
    const inv = await this.payments.issueInvoice(club.id, id);
    return {
      id: inv.id,
      clubId: inv.clubId,
      familyId: inv.familyId,
      householdGroupId: inv.householdGroupId ?? null,
      clubSeasonId: inv.clubSeasonId ?? null,
      label: inv.label,
      baseAmountCents: inv.baseAmountCents,
      amountCents: inv.amountCents,
      status: inv.status,
      lockedPaymentMethod: inv.lockedPaymentMethod ?? null,
      dueAt: inv.dueAt,
      totalPaidCents: 0,
      balanceCents: inv.amountCents,
    };
  }

  @Mutation(() => InvoiceGraph)
  async voidClubInvoice(
    @CurrentClub() club: Club,
    @Args('id', { type: () => String }) id: string,
    @Args('reason', { type: () => String, nullable: true })
    reason: string | null,
  ): Promise<InvoiceGraph> {
    const inv = await this.payments.voidInvoice(club.id, id, reason ?? undefined);
    return {
      id: inv.id,
      clubId: inv.clubId,
      familyId: inv.familyId,
      householdGroupId: inv.householdGroupId ?? null,
      clubSeasonId: inv.clubSeasonId ?? null,
      label: inv.label,
      baseAmountCents: inv.baseAmountCents,
      amountCents: inv.amountCents,
      status: inv.status,
      lockedPaymentMethod: inv.lockedPaymentMethod ?? null,
      dueAt: inv.dueAt,
      totalPaidCents: 0,
      balanceCents: 0,
    };
  }
}
