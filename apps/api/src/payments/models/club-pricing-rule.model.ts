import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod, PricingAdjustmentType } from '@prisma/client';

@ObjectType()
export class ClubPricingRuleGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field(() => PricingAdjustmentType)
  adjustmentType!: PricingAdjustmentType;

  @Field(() => Int)
  adjustmentValue!: number;
}
