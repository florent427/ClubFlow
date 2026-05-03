import { Field, Float, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AccountingSuggestionGraph {
  @Field(() => String, { nullable: true })
  accountCode!: string | null;

  @Field(() => String, { nullable: true })
  accountLabel!: string | null;

  @Field(() => String, { nullable: true })
  cohortCode!: string | null;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => String, { nullable: true })
  projectTitle!: string | null;

  @Field(() => String, { nullable: true })
  disciplineCode!: string | null;

  @Field(() => Float, { nullable: true })
  confidenceAccount!: number | null;

  @Field(() => Float, { nullable: true })
  confidenceCohort!: number | null;

  @Field(() => Float, { nullable: true })
  confidenceProject!: number | null;

  @Field(() => Float, { nullable: true })
  confidenceDiscipline!: number | null;

  @Field(() => String, { nullable: true })
  reasoning!: string | null;

  @Field()
  budgetBlocked!: boolean;

  /** Message d'erreur si l'IA n'a pas pu catégoriser (model down, quota, parse failed, compte inconnu…). */
  @Field(() => String, { nullable: true })
  errorMessage!: string | null;
}
