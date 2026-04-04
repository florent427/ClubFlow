import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

@InputType()
export class CreateMembershipOneTimeFeeInput {
  @Field(() => String)
  @IsString()
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  amountCents!: number;
}

@InputType()
export class UpdateMembershipOneTimeFeeInput {
  @Field(() => ID)
  @IsUUID('4')
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  label?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;
}
