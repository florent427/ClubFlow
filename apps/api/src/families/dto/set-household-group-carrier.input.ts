import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsUUID } from 'class-validator';

@InputType()
export class SetHouseholdGroupCarrierInput {
  @Field(() => ID)
  @IsUUID()
  householdGroupId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  carrierFamilyId?: string | null;
}
