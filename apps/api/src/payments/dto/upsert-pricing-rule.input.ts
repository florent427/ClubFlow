import { Field, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod, PricingAdjustmentType } from '@prisma/client';
import { IsEnum, IsInt } from 'class-validator';

@InputType()
export class UpsertClubPricingRuleInput {
  @Field(() => ClubPaymentMethod)
  @IsEnum(ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field(() => PricingAdjustmentType)
  @IsEnum(PricingAdjustmentType)
  adjustmentType!: PricingAdjustmentType;

  @Field(() => Int)
  @IsInt()
  adjustmentValue!: number;
}
