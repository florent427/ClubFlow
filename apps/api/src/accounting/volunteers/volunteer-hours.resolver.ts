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
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
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
import {
  VolunteerHoursCategoryRow,
  VolunteerHoursPostingRow,
  VolunteerHoursRow,
  VolunteerHoursService,
} from './volunteer-hours.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Type de bénévolat du club et son taux horaire. */
@ObjectType()
export class VolunteerHoursCategoryGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  label!: string;

  @Field(() => Int, { description: 'Taux horaire en centimes.' })
  hourlyRateCents!: number;

  @Field()
  archived!: boolean;

  @Field(() => Int, { description: 'Nombre de saisies qui portent ce type.' })
  hoursCount!: number;
}

@InputType()
export class VolunteerHoursCategoryInputGraph {
  @Field()
  @IsString()
  @MaxLength(120)
  label!: string;

  @Field(() => Int, { description: 'Taux horaire en centimes.' })
  @IsInt()
  @Min(0)
  @Max(100_000)
  hourlyRateCents!: number;
}

/** Heures de bénévolat d'une personne pour une activité, un jour donné. */
@ObjectType()
export class VolunteerHoursGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field({ description: 'Prénom et nom du bénévole.' })
  volunteerName!: string;

  @Field({ description: 'YYYY-MM-DD' })
  workedOn!: string;

  @Field(() => Int)
  minutes!: number;

  @Field(() => ID, { nullable: true })
  categoryId!: string | null;

  @Field(() => String, { nullable: true, description: 'Libellé du type de bénévolat.' })
  categoryLabel!: string | null;

  @Field()
  activity!: string;

  @Field(() => Int, { description: 'Taux horaire appliqué, en centimes.' })
  hourlyRateCents!: number;

  @Field(() => Int, { description: 'Valeur en centimes : minutes × taux / 60.' })
  valueCents!: number;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => ID, { nullable: true, description: 'Null tant que non comptabilisée.' })
  postingId!: string | null;

  @Field(() => ID, { nullable: true })
  postingEntryId!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

/** Comptabilisation du bénévolat d'une période. */
@ObjectType()
export class VolunteerHoursPostingGraph {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'YYYY-MM-DD' })
  periodStart!: string;

  @Field({ description: 'YYYY-MM-DD' })
  periodEnd!: string;

  @Field(() => Int)
  totalMinutes!: number;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => Int)
  hoursCount!: number;

  @Field(() => ID, { nullable: true })
  entryId!: string | null;

  @Field(() => String, { nullable: true, description: 'Statut de l’écriture (POSTED, LOCKED…).' })
  entryStatus!: string | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@InputType()
export class VolunteerHoursInputGraph {
  @Field(() => ID, { nullable: true, description: 'Adhérent bénévole (ou contactId).' })
  @IsOptional()
  @IsUUID()
  memberId?: string | null;

  @Field(() => ID, { nullable: true, description: 'Contact bénévole (ou memberId).' })
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @Field({ description: 'YYYY-MM-DD' })
  @Matches(ISO_DATE)
  workedOn!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  minutes!: number;

  @Field(() => ID, { nullable: true, description: 'Type de bénévolat (fixe le taux proposé).' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @Field(() => String, { nullable: true, description: 'Précision ; vide = libellé du type.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  activity?: string | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Taux horaire en centimes ; absent = taux du type, sinon du club.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  hourlyRateCents?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

@InputType()
export class PostVolunteerHoursInput {
  @Field({ description: 'YYYY-MM-DD' })
  @Matches(ISO_DATE)
  periodStart!: string;

  @Field({ description: 'YYYY-MM-DD' })
  @Matches(ISO_DATE)
  periodEnd!: string;
}

function toHoursGraph(r: VolunteerHoursRow): VolunteerHoursGraph {
  const person = r.member ?? r.contact;
  return {
    id: r.id,
    memberId: r.memberId,
    contactId: r.contactId,
    volunteerName: person ? `${person.firstName} ${person.lastName}`.trim() : '—',
    workedOn: formatIsoDate(r.workedOn),
    minutes: r.minutes,
    categoryId: r.categoryId,
    categoryLabel: r.category?.label ?? null,
    activity: r.activity,
    hourlyRateCents: r.hourlyRateCents,
    valueCents: r.valueCents,
    notes: r.notes,
    postingId: r.postingId,
    postingEntryId: r.posting?.entryId ?? null,
    createdAt: r.createdAt,
  };
}

function toCategoryGraph(c: VolunteerHoursCategoryRow): VolunteerHoursCategoryGraph {
  return {
    id: c.id,
    label: c.label,
    hourlyRateCents: c.hourlyRateCents,
    archived: c.archivedAt !== null,
    hoursCount: c._count.hours,
  };
}

function toPostingGraph(p: VolunteerHoursPostingRow): VolunteerHoursPostingGraph {
  return {
    id: p.id,
    periodStart: formatIsoDate(p.periodStart),
    periodEnd: formatIsoDate(p.periodEnd),
    totalMinutes: p.totalMinutes,
    totalCents: p.totalCents,
    hoursCount: p._count.hours,
    entryId: p.entryId,
    entryStatus: p.entry?.status ?? null,
    createdAt: p.createdAt,
  };
}

function toServiceInput(input: VolunteerHoursInputGraph) {
  return {
    memberId: input.memberId ?? null,
    contactId: input.contactId ?? null,
    workedOn: parseIsoDate(input.workedOn),
    minutes: input.minutes,
    categoryId: input.categoryId ?? null,
    activity: input.activity ?? null,
    hourlyRateCents: input.hourlyRateCents ?? null,
    notes: input.notes ?? null,
  };
}

/** Bénévolat valorisé : heures, taux horaire, comptabilisation 864/870. */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class VolunteerHoursResolver {
  constructor(private readonly hours: VolunteerHoursService) {}

  @Query(() => [VolunteerHoursCategoryGraph], {
    name: 'clubVolunteerHoursCategories',
    description: 'Types de bénévolat du club et leurs taux horaires.',
  })
  async clubVolunteerHoursCategories(
    @CurrentClub() club: Club,
    @Args('includeArchived', { type: () => Boolean, nullable: true }) includeArchived: boolean | null,
  ): Promise<VolunteerHoursCategoryGraph[]> {
    return (await this.hours.listCategories(club.id, includeArchived ?? false)).map(toCategoryGraph);
  }

  @Mutation(() => VolunteerHoursCategoryGraph, { name: 'createClubVolunteerHoursCategory' })
  async createClubVolunteerHoursCategory(
    @CurrentClub() club: Club,
    @Args('input') input: VolunteerHoursCategoryInputGraph,
  ): Promise<VolunteerHoursCategoryGraph> {
    return toCategoryGraph(await this.hours.createCategory(club.id, input));
  }

  @Mutation(() => VolunteerHoursCategoryGraph, { name: 'updateClubVolunteerHoursCategory' })
  async updateClubVolunteerHoursCategory(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: VolunteerHoursCategoryInputGraph,
  ): Promise<VolunteerHoursCategoryGraph> {
    return toCategoryGraph(await this.hours.updateCategory(club.id, id, input));
  }

  @Mutation(() => VolunteerHoursCategoryGraph, { name: 'setClubVolunteerHoursCategoryArchived' })
  async setClubVolunteerHoursCategoryArchived(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('archived', { type: () => Boolean }) archived: boolean,
  ): Promise<VolunteerHoursCategoryGraph> {
    return toCategoryGraph(await this.hours.setCategoryArchived(club.id, id, archived));
  }

  @Mutation(() => Boolean, { name: 'deleteClubVolunteerHoursCategory' })
  async deleteClubVolunteerHoursCategory(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.hours.deleteCategory(club.id, id);
    return true;
  }

  @Query(() => Int, {
    name: 'clubVolunteerHourlyRate',
    nullable: true,
    description: 'Taux horaire des saisies sans type, en centimes (null = non défini).',
  })
  clubVolunteerHourlyRate(@CurrentClub() club: Club): Promise<number | null> {
    return this.hours.getHourlyRate(club.id);
  }

  @Mutation(() => Int, { name: 'setClubVolunteerHourlyRate', nullable: true })
  setClubVolunteerHourlyRate(
    @CurrentClub() club: Club,
    @Args('hourlyRateCents', { type: () => Int, nullable: true }) cents: number | null,
  ): Promise<number | null> {
    return this.hours.setHourlyRate(club.id, cents ?? null);
  }

  @Query(() => [VolunteerHoursGraph], {
    name: 'clubVolunteerHours',
    description: 'Heures saisies, du plus récent au plus ancien ; from / to en YYYY-MM-DD.',
  })
  async clubVolunteerHours(
    @CurrentClub() club: Club,
    @Args('from', { type: () => String, nullable: true })
    from: string | null,
    @Args('to', { type: () => String, nullable: true })
    to: string | null,
  ): Promise<VolunteerHoursGraph[]> {
    const rows = await this.hours.list(club.id, {
      from: from ? parseIsoDate(from) : null,
      to: to ? parseIsoDate(to) : null,
    });
    return rows.map(toHoursGraph);
  }

  @Mutation(() => VolunteerHoursGraph, { name: 'createClubVolunteerHours' })
  async createClubVolunteerHours(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: VolunteerHoursInputGraph,
  ): Promise<VolunteerHoursGraph> {
    return toHoursGraph(await this.hours.create(club.id, user.userId, toServiceInput(input)));
  }

  @Mutation(() => VolunteerHoursGraph, { name: 'updateClubVolunteerHours' })
  async updateClubVolunteerHours(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: VolunteerHoursInputGraph,
  ): Promise<VolunteerHoursGraph> {
    return toHoursGraph(await this.hours.update(club.id, id, toServiceInput(input)));
  }

  @Mutation(() => Boolean, { name: 'deleteClubVolunteerHours' })
  async deleteClubVolunteerHours(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.hours.remove(club.id, id);
    return true;
  }

  @Query(() => [VolunteerHoursPostingGraph], { name: 'clubVolunteerHoursPostings' })
  async clubVolunteerHoursPostings(
    @CurrentClub() club: Club,
  ): Promise<VolunteerHoursPostingGraph[]> {
    return (await this.hours.listPostings(club.id)).map(toPostingGraph);
  }

  @Mutation(() => VolunteerHoursPostingGraph, {
    name: 'postClubVolunteerHours',
    description:
      'Comptabilise les heures non comptabilisées de la période : écriture en nature 864000 / 870000 datée du dernier jour.',
  })
  async postClubVolunteerHours(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: PostVolunteerHoursInput,
  ): Promise<VolunteerHoursPostingGraph> {
    const posting = await this.hours.post(club.id, user.userId, {
      periodStart: parseIsoDate(input.periodStart),
      periodEnd: parseIsoDate(input.periodEnd),
    });
    return toPostingGraph(posting);
  }

  @Mutation(() => Boolean, { name: 'cancelClubVolunteerHoursPosting' })
  async cancelClubVolunteerHoursPosting(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.hours.cancelPosting(club.id, user.userId, id);
    return true;
  }
}
