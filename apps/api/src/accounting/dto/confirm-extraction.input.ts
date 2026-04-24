import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class ConfirmExtractionInput {
  @Field(() => ID)
  @IsUUID()
  entryId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  occurredAt?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  accountCode?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  cohortCode?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  disciplineCode?: string;
}
