import { Field, ID, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

@InputType()
export class CreateHouseholdGroupInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  carrierFamilyId?: string | null;
}
