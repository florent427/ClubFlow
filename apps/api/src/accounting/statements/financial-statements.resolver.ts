import { UseGuards } from '@nestjs/common';
import { Args, Field, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../../common/decorators/current-club.decorator';
import { RequireClubModule } from '../../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import {
  formatIsoDate,
  parseIsoDate,
  todayInClubTimezone,
} from '../accounting-fiscal-year.service';
import { FinancialStatementsService } from './financial-statements.service';

@ObjectType()
export class StatementLineGraph {
  /** Vide pour une ligne calculée (résultat, résultats antérieurs). */
  @Field()
  accountCode!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;
}

@ObjectType()
export class StatementSectionGraph {
  @Field()
  key!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => [StatementLineGraph])
  lines!: StatementLineGraph[];
}

@ObjectType()
export class IncomeStatementGraph {
  @Field(() => [StatementSectionGraph])
  expenses!: StatementSectionGraph[];

  @Field(() => [StatementSectionGraph])
  revenues!: StatementSectionGraph[];

  @Field(() => Int)
  totalExpensesCents!: number;

  @Field(() => Int)
  totalRevenuesCents!: number;

  @Field(() => Int)
  resultCents!: number;

  @Field(() => [StatementLineGraph])
  inKindUses!: StatementLineGraph[];

  @Field(() => [StatementLineGraph])
  inKindContributions!: StatementLineGraph[];

  @Field(() => Int)
  totalInKindUsesCents!: number;

  @Field(() => Int)
  totalInKindContributionsCents!: number;
}

@ObjectType()
export class BalanceSheetGraph {
  @Field(() => [StatementSectionGraph])
  assets!: StatementSectionGraph[];

  @Field(() => [StatementSectionGraph])
  liabilities!: StatementSectionGraph[];

  @Field(() => Int)
  totalAssetsCents!: number;

  @Field(() => Int)
  totalLiabilitiesCents!: number;

  @Field(() => Int)
  imbalanceCents!: number;
}

@ObjectType()
export class FinancialStatementsGraph {
  @Field()
  asOf!: string;

  @Field()
  fiscalYearLabel!: string;

  @Field()
  fiscalYearStartsOn!: string;

  @Field()
  fiscalYearEndsOn!: string;

  @Field(() => IncomeStatementGraph)
  incomeStatement!: IncomeStatementGraph;

  @Field(() => BalanceSheetGraph)
  balanceSheet!: BalanceSheetGraph;

  @Field(() => [StatementLineGraph])
  unclassified!: StatementLineGraph[];

  @Field(() => Int)
  needsReviewCount!: number;

  @Field(() => Int)
  needsReviewCents!: number;

  @Field(() => Int)
  draftCount!: number;

  @Field(() => [String])
  financialAccountsWithoutOpening!: string[];
}

/** Bilan et compte de résultat provisoires à une date. */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class FinancialStatementsResolver {
  constructor(private readonly statements: FinancialStatementsService) {}

  @Query(() => FinancialStatementsGraph, {
    name: 'clubFinancialStatements',
    description:
      'Bilan et compte de résultat provisoires arrêtés à une date (YYYY-MM-DD, défaut : aujourd’hui).',
  })
  async clubFinancialStatements(
    @CurrentClub() club: Club,
    @Args('asOf', { type: () => String, nullable: true }) asOf: string | null,
  ): Promise<FinancialStatementsGraph> {
    const date = asOf ? parseIsoDate(asOf) : todayInClubTimezone();
    const report = await this.statements.statements(club.id, date);
    return {
      asOf: formatIsoDate(report.asOf),
      fiscalYearLabel: report.fiscalYear.label,
      fiscalYearStartsOn: formatIsoDate(report.fiscalYear.startsOn),
      fiscalYearEndsOn: formatIsoDate(report.fiscalYear.endsOn),
      incomeStatement: report.incomeStatement,
      balanceSheet: report.balanceSheet,
      unclassified: report.unclassified,
      needsReviewCount: report.needsReviewCount,
      needsReviewCents: report.needsReviewCents,
      draftCount: report.draftCount,
      financialAccountsWithoutOpening: report.financialAccountsWithoutOpening,
    };
  }
}
