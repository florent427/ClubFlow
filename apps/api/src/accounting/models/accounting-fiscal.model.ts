import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Exercice comptable et reprise (ADR-0014 §1). Les dates calendaires sont
 * exposées en « YYYY-MM-DD » : ce sont des jours, pas des instants, et un
 * horodatage ISO glisserait d'un jour selon le fuseau du client.
 */
@ObjectType()
export class AccountingFiscalSettingsGraph {
  @Field(() => Int)
  fiscalYearStartMonth!: number;

  @Field(() => Int)
  fiscalYearStartDay!: number;

  /** Date de reprise de la compta dans ClubFlow ; null = non définie. */
  @Field(() => String, { nullable: true })
  accountingStartsOn!: string | null;

  /** Année de début de l'exercice en cours. */
  @Field(() => Int)
  currentFiscalYear!: number;

  /** « 2026 » ou « 2026-2027 ». */
  @Field()
  currentFiscalYearLabel!: string;

  @Field()
  currentFiscalYearStartsOn!: string;

  @Field()
  currentFiscalYearEndsOn!: string;
}

@ObjectType()
export class AccountingPeriodLockGraph {
  /** « YYYY-MM ». */
  @Field()
  month!: string;

  @Field(() => GraphQLISODateTime)
  lockedAt!: Date;

  @Field(() => ID)
  lockedByUserId!: string;
}

@ObjectType()
export class AccountingFiscalYearCloseGraph {
  /** Année de DÉBUT de l'exercice clos. */
  @Field(() => Int)
  year!: number;

  @Field()
  label!: string;

  @Field()
  startsOn!: string;

  @Field()
  endsOn!: string;

  @Field(() => GraphQLISODateTime)
  closedAt!: Date;

  @Field(() => ID)
  closedByUserId!: string;
}
