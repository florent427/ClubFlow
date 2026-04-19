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
export class CreateAccountingEntryInput {
  @Field(() => AccountingEntryKind)
  @IsEnum(AccountingEntryKind)
  kind!: AccountingEntryKind;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  amountCents!: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  occurredAt?: Date;
}
