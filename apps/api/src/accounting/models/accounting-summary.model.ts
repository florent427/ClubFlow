import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AccountingSummaryGraph {
  @Field(() => Int)
  incomeCents!: number;

  @Field(() => Int)
  expenseCents!: number;

  @Field(() => Int)
  balanceCents!: number;

  @Field(() => Int)
  inKindCents!: number;

  @Field(() => Int)
  needsReviewCount!: number;
}
