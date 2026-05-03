import { Field, InputType, Int } from '@nestjs/graphql';
import { AccountingEntryKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class SuggestAccountingCategorizationInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @Field(() => AccountingEntryKind, { nullable: true })
  @IsOptional()
  @IsEnum(AccountingEntryKind)
  kind?: AccountingEntryKind;
}
