import { UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { AccountingEntrySource, type Club } from '@prisma/client';
import { IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { CurrentClub } from '../../common/decorators/current-club.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireClubModule } from '../../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../../common/types/request-user';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import { formatIsoDate, parseIsoDate } from '../accounting-fiscal-year.service';
import { CashBookService } from './cash-book.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Un mouvement du livre, avec le solde qu'il laisse derrière lui. */
@ObjectType()
export class CashBookLineGraph {
  @Field(() => ID)
  entryId!: string;

  @Field()
  occurredAt!: string;

  @Field()
  label!: string;

  @Field(() => AccountingEntrySource)
  source!: AccountingEntrySource;

  /** Positif = la caisse se remplit. */
  @Field(() => Int)
  amountCents!: number;

  @Field(() => Int)
  balanceCents!: number;

  @Field(() => [String])
  counterpartCodes!: string[];

  @Field(() => GraphQLISODateTime, { nullable: true })
  reconciledAt!: Date | null;
}

@ObjectType()
export class CashBookGraph {
  @Field(() => ID)
  financialAccountId!: string;

  @Field()
  label!: string;

  @Field()
  accountCode!: string;

  @Field()
  from!: string;

  @Field()
  to!: string;

  @Field(() => Int)
  openingCents!: number;

  @Field(() => Int)
  closingCents!: number;

  @Field()
  hasOpeningBalance!: boolean;

  @Field(() => [CashBookLineGraph])
  lines!: CashBookLineGraph[];
}

@ObjectType()
export class CashCountGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  financialAccountId!: string;

  @Field()
  financialAccountLabel!: string;

  @Field()
  countedOn!: string;

  @Field(() => Int)
  countedCents!: number;

  @Field(() => Int)
  expectedCents!: number;

  /** Négatif = il manque de l'argent dans le tiroir. */
  @Field(() => Int)
  deltaCents!: number;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field(() => ID, { nullable: true })
  adjustmentEntryId!: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  validatedAt!: Date | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@InputType()
export class RecordCashCountInput {
  @Field(() => ID)
  @IsUUID()
  financialAccountId!: string;

  @Field({ description: 'YYYY-MM-DD' })
  @Matches(ISO_DATE)
  countedOn!: string;

  @Field(() => Int, { description: 'Ce qu’il y a vraiment dans le tiroir.' })
  @IsInt()
  @Min(0)
  countedCents!: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

@InputType()
export class RecordCashTransferInput {
  @Field(() => ID, { description: 'Caisse pour un dépôt, banque pour un retrait.' })
  @IsUUID()
  fromAccountId!: string;

  @Field(() => ID)
  @IsUUID()
  toAccountId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @Field({ description: 'YYYY-MM-DD' })
  @Matches(ISO_DATE)
  on!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** Livre de caisse, comptages et mouvements d'espèces (ADR-0014 §8). */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class CashBookResolver {
  constructor(private readonly cash: CashBookService) {}

  @Query(() => CashBookGraph, {
    name: 'clubCashBook',
    description: 'Mouvements d’un compte sur une période, avec le solde courant.',
  })
  async clubCashBook(
    @CurrentClub() club: Club,
    @Args('financialAccountId', { type: () => ID }) financialAccountId: string,
    @Args('from') from: string,
    @Args('to') to: string,
  ): Promise<CashBookGraph> {
    const book = await this.cash.book(
      club.id,
      financialAccountId,
      parseIsoDate(from),
      parseIsoDate(to),
    );
    return {
      ...book,
      from: formatIsoDate(book.from),
      to: formatIsoDate(book.to),
      lines: book.lines.map((l) => ({ ...l, occurredAt: formatIsoDate(l.occurredAt) })),
    };
  }

  @Query(() => [CashCountGraph], { name: 'clubCashCounts' })
  async clubCashCounts(
    @CurrentClub() club: Club,
    @Args('financialAccountId', { type: () => ID, nullable: true })
    financialAccountId: string | null,
  ): Promise<CashCountGraph[]> {
    const rows = await this.cash.listCounts(club.id, financialAccountId);
    return rows.map(toCountGraph);
  }

  @Mutation(() => CashCountGraph, {
    name: 'recordCashCount',
    description: 'Constate ce qu’il y a dans le tiroir. Ne comptabilise rien.',
  })
  async recordCashCount(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RecordCashCountInput,
  ): Promise<CashCountGraph> {
    const row = await this.cash.recordCount(club.id, user.userId, {
      financialAccountId: input.financialAccountId,
      countedOn: parseIsoDate(input.countedOn),
      countedCents: input.countedCents,
      note: input.note ?? null,
    });
    return toCountGraph(row);
  }

  @Mutation(() => CashCountGraph, {
    name: 'validateCashCount',
    description: 'Assume l’écart : charge 658000 s’il manque, produit 758000 s’il y a trop.',
  })
  async validateCashCount(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('countId', { type: () => ID }) countId: string,
  ): Promise<CashCountGraph> {
    const row = await this.cash.validateCashCount(club.id, user.userId, countId);
    return toCountGraph(row);
  }

  @Mutation(() => Boolean, { name: 'deleteCashCount' })
  async deleteCashCount(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('countId', { type: () => ID }) countId: string,
  ): Promise<boolean> {
    return this.cash.deleteCount(club.id, user.userId, countId);
  }

  @Mutation(() => ID, {
    name: 'recordCashTransfer',
    description: 'Dépôt d’espèces en banque, ou retrait. Renvoie l’écriture créée.',
  })
  async recordCashTransfer(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RecordCashTransferInput,
  ): Promise<string> {
    const entry = await this.cash.recordCashTransfer(club.id, user.userId, {
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountCents: input.amountCents,
      on: parseIsoDate(input.on),
      note: input.note ?? null,
    });
    return entry.id;
  }
}

type CountRow = Awaited<ReturnType<CashBookService['getCount']>>;

function toCountGraph(r: CountRow): CashCountGraph {
  return {
    id: r.id,
    financialAccountId: r.financialAccountId,
    financialAccountLabel: r.financialAccount.label,
    countedOn: formatIsoDate(r.countedOn),
    countedCents: r.countedCents,
    expectedCents: r.expectedCents,
    deltaCents: r.deltaCents,
    note: r.note,
    adjustmentEntryId: r.adjustmentEntryId,
    validatedAt: r.validatedAt,
    createdAt: r.createdAt,
  };
}
