import { Field, InputType, Int } from '@nestjs/graphql';
import { AccountingEntryKind } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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

  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  accountCode!: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  occurredAt?: Date;

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

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  freeformTags?: string[];

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  documentMediaAssetIds?: string[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  vatAmountCents?: number;

  /** Compte financier de contrepartie (banque/caisse/transit). */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  financialAccountId?: string;
}
