import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { AccountingService } from './accounting.service';
import { CreateAccountingEntryInput } from './dto/create-accounting-entry.input';
import { AccountingEntryGraph } from './models/accounting-entry.model';
import { AccountingSummaryGraph } from './models/accounting-summary.model';

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class AccountingResolver {
  constructor(private readonly accounting: AccountingService) {}

  @Query(() => [AccountingEntryGraph], { name: 'clubAccountingEntries' })
  async clubAccountingEntries(
    @CurrentClub() club: Club,
  ): Promise<AccountingEntryGraph[]> {
    const rows = await this.accounting.listEntries(club.id);
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      kind: r.kind,
      label: r.label,
      amountCents: r.amountCents,
      paymentId: r.paymentId,
      occurredAt: r.occurredAt,
    }));
  }

  @Query(() => AccountingSummaryGraph, { name: 'clubAccountingSummary' })
  clubAccountingSummary(
    @CurrentClub() club: Club,
  ): Promise<AccountingSummaryGraph> {
    return this.accounting.summary(club.id);
  }

  @Mutation(() => AccountingEntryGraph)
  async createClubAccountingEntry(
    @CurrentClub() club: Club,
    @Args('input') input: CreateAccountingEntryInput,
  ): Promise<AccountingEntryGraph> {
    const r = await this.accounting.createManualEntry(club.id, input);
    return {
      id: r.id,
      clubId: r.clubId,
      kind: r.kind,
      label: r.label,
      amountCents: r.amountCents,
      paymentId: r.paymentId,
      occurredAt: r.occurredAt,
    };
  }

  @Mutation(() => Boolean)
  async deleteClubAccountingEntry(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.accounting.deleteEntry(club.id, id);
  }
}
