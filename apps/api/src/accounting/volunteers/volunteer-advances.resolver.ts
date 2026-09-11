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
import type { Club } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsUUID, Matches } from 'class-validator';
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
import { VolunteerAdvancesService } from './volunteer-advances.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ce que le club doit à un bénévole. */
@ObjectType()
export class VolunteerBalanceGraph {
  @Field(() => ID)
  memberId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  /** Somme des reçus avancés que rien ne rembourse encore. */
  @Field(() => Int)
  openCents!: number;

  @Field(() => Int)
  openCount!: number;

  /** Date du plus ancien reçu ouvert, pour trier par urgence. */
  @Field(() => String, { nullable: true })
  oldestOccurredAt!: string | null;
}

/** Un reçu avancé qui attend son remboursement. */
@ObjectType()
export class VolunteerOpenItemGraph {
  @Field(() => ID)
  entryId!: string;

  @Field()
  label!: string;

  @Field()
  occurredAt!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field()
  accountCode!: string;

  @Field()
  accountLabel!: string;
}

@ObjectType()
export class VolunteerReimbursementItemGraph {
  @Field(() => ID)
  entryId!: string;

  @Field()
  label!: string;

  @Field()
  occurredAt!: string;

  @Field(() => Int)
  amountCents!: number;
}

@ObjectType()
export class VolunteerReimbursementGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  memberId!: string;

  @Field()
  memberName!: string;

  @Field(() => ID)
  financialAccountId!: string;

  @Field()
  financialAccountLabel!: string;

  @Field()
  paidOn!: string;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => ID, { nullable: true })
  entryId!: string | null;

  @Field()
  status!: string;

  @Field(() => [VolunteerReimbursementItemGraph])
  items!: VolunteerReimbursementItemGraph[];

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@InputType()
export class SetAdvancedByInput {
  @Field(() => ID)
  @IsUUID()
  entryId!: string;

  @Field(() => ID, { nullable: true, description: 'Null pour rendre la dépense au club.' })
  @IsOptional()
  @IsUUID()
  memberId?: string | null;
}

@InputType()
export class RecordVolunteerReimbursementInput {
  @Field(() => ID)
  @IsUUID()
  memberId!: string;

  @Field(() => ID, { description: 'Banque ou caisse d’où part l’argent.' })
  @IsUUID()
  financialAccountId!: string;

  @Field({ description: 'YYYY-MM-DD' })
  @Matches(ISO_DATE)
  paidOn!: string;

  @Field(() => [ID], { description: 'Reçus soldés par ce remboursement.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  entryIds!: string[];
}

@InputType()
export class AcceptBankLineVolunteerReimbursementInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => ID)
  @IsUUID()
  memberId!: string;

  @Field(() => [ID], { description: 'Reçus soldés par ce remboursement.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  entryIds!: string[];
}

/** Écritures (reçus) d'un bénévole et remboursements (ADR-0016). */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class VolunteerAdvancesResolver {
  constructor(private readonly volunteers: VolunteerAdvancesService) {}

  @Query(() => [VolunteerBalanceGraph], {
    name: 'volunteerAdvanceBalances',
    description: 'Ce que le club doit à chaque bénévole ayant avancé des frais.',
  })
  async volunteerAdvanceBalances(@CurrentClub() club: Club): Promise<VolunteerBalanceGraph[]> {
    const rows = await this.volunteers.balances(club.id);
    return rows.map((r) => ({
      ...r,
      oldestOccurredAt: r.oldestOccurredAt ? formatIsoDate(r.oldestOccurredAt) : null,
    }));
  }

  @Query(() => [VolunteerOpenItemGraph], { name: 'volunteerOpenItems' })
  async volunteerOpenItems(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
  ): Promise<VolunteerOpenItemGraph[]> {
    const rows = await this.volunteers.openItems(club.id, memberId);
    return rows.map((r) => ({ ...r, occurredAt: formatIsoDate(r.occurredAt) }));
  }

  @Query(() => [VolunteerReimbursementGraph], { name: 'volunteerReimbursements' })
  async volunteerReimbursements(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID, nullable: true }) memberId: string | null,
  ): Promise<VolunteerReimbursementGraph[]> {
    const rows = await this.volunteers.listReimbursements(club.id, memberId);
    return rows.map((r) => toGraph(r));
  }

  @Mutation(() => Boolean, {
    name: 'setAccountingEntryAdvancedBy',
    description:
      'Désigne le bénévole qui a avancé cette dépense : la contrepartie bascule sur le compte de tiers 467100.',
  })
  async setAccountingEntryAdvancedBy(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: SetAdvancedByInput,
  ): Promise<boolean> {
    await this.volunteers.setAdvancedBy(
      club.id,
      user.userId,
      input.entryId,
      input.memberId ?? null,
    );
    return true;
  }

  @Mutation(() => VolunteerReimbursementGraph, {
    name: 'recordVolunteerReimbursement',
    description:
      'Rembourse un bénévole : une écriture unique DÉBIT 467100 / CRÉDIT compte du club, pour les reçus choisis.',
  })
  async recordVolunteerReimbursement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RecordVolunteerReimbursementInput,
  ): Promise<VolunteerReimbursementGraph> {
    const row = await this.volunteers.recordReimbursement(club.id, user.userId, {
      memberId: input.memberId,
      financialAccountId: input.financialAccountId,
      paidOn: parseIsoDate(input.paidOn),
      entryIds: input.entryIds,
    });
    return toGraph(row);
  }

  @Mutation(() => VolunteerReimbursementGraph, {
    name: 'acceptBankLineVolunteerReimbursement',
    description:
      'Accepte la proposition d’une ligne de relevé : rembourse le bénévole à la date et sur le compte de la ligne, puis rapproche la ligne.',
  })
  async acceptBankLineVolunteerReimbursement(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AcceptBankLineVolunteerReimbursementInput,
  ): Promise<VolunteerReimbursementGraph> {
    const row = await this.volunteers.acceptFromBankLine(club.id, user.userId, {
      lineId: input.lineId,
      memberId: input.memberId,
      entryIds: input.entryIds,
    });
    return toGraph(row);
  }
}

type ReimbursementRow = Awaited<
  ReturnType<VolunteerAdvancesService['getReimbursement']>
>;

function toGraph(r: ReimbursementRow): VolunteerReimbursementGraph {
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: `${r.member.firstName} ${r.member.lastName}`.trim(),
    financialAccountId: r.financialAccountId,
    financialAccountLabel: r.financialAccount.label,
    paidOn: formatIsoDate(r.paidOn),
    totalCents: r.totalCents,
    entryId: r.entryId,
    status: r.status,
    items: r.items.map((i) => ({
      entryId: i.entryId,
      label: i.entry.label,
      occurredAt: formatIsoDate(i.entry.occurredAt),
      amountCents: i.amountCents,
    })),
    createdAt: r.createdAt,
  };
}
