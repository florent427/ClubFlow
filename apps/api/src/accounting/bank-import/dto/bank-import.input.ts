import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { BankStatementFormat, BankStatementLineIgnoreReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** 5 Mo de fichier ≈ 6,7 Mo en base64. */
const MAX_BASE64 = 7_000_000;

@InputType()
export class CsvMappingInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(1)
  delimiter!: string;

  @Field()
  @IsBoolean()
  hasHeader!: boolean;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  dateCol!: number;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  labelCol!: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCol?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  debitCol?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditCol?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  balanceCol?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  valueDateCol?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  referenceCol?: number | null;

  @Field()
  @IsIn(['DMY', 'YMD', 'MDY'])
  dateFormat!: 'DMY' | 'YMD' | 'MDY';

  @Field()
  @IsIn([',', '.'])
  decimalSeparator!: ',' | '.';
}

@InputType()
export class PreviewCsvStatementInput {
  @Field({ description: 'Contenu du fichier, en base64.' })
  @IsString()
  @MaxLength(MAX_BASE64)
  contentBase64!: string;

  @Field(() => CsvMappingInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CsvMappingInput)
  mapping?: CsvMappingInput | null;
}

@InputType()
export class ImportBankStatementInput {
  @Field(() => ID)
  @IsUUID()
  financialAccountId!: string;

  @Field(() => BankStatementFormat, {
    description: 'OFX, CSV ou PDF (lu par deux modèles en arrière-plan).',
  })
  @IsEnum(BankStatementFormat)
  format!: BankStatementFormat;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @Field({ description: 'Contenu du fichier, en base64.' })
  @IsString()
  @MaxLength(MAX_BASE64)
  contentBase64!: string;

  @Field(() => CsvMappingInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CsvMappingInput)
  csvMapping?: CsvMappingInput | null;

  @Field(() => Int, { nullable: true, description: 'Requis si le fichier ne porte pas les soldes.' })
  @IsOptional()
  @IsInt()
  openingBalanceCents?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  closingBalanceCents?: number | null;

  @Field(() => String, { nullable: true, description: 'YYYY-MM-DD ; défaut : lu dans le fichier.' })
  @IsOptional()
  @Matches(ISO_DATE)
  periodStart?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(ISO_DATE)
  periodEnd?: string | null;
}

@InputType()
export class UpdateBankStatementLineInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(ISO_DATE)
  bookedOn?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  label?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  amountCents?: number | null;
}

@InputType()
export class AddBankStatementLineInput {
  @Field(() => ID)
  @IsUUID()
  statementId!: string;

  @Field()
  @Matches(ISO_DATE)
  bookedOn!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;

  @Field(() => Int)
  @IsInt()
  amountCents!: number;
}

@InputType()
export class BankLineAllocationInput {
  @Field(() => ID)
  @IsUUID()
  entryId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  amountCents!: number;
}

@InputType()
export class MatchBankLineInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => [BankLineAllocationInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BankLineAllocationInput)
  allocations!: BankLineAllocationInput[];
}

@InputType()
export class IgnoreBankLineInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => BankStatementLineIgnoreReason)
  @IsEnum(BankStatementLineIgnoreReason)
  reason!: BankStatementLineIgnoreReason;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

@InputType()
export class UpdateBankStatementBalancesInput {
  @Field(() => ID)
  @IsUUID()
  statementId!: string;

  @Field(() => Int)
  @IsInt()
  openingBalanceCents!: number;

  @Field(() => Int)
  @IsInt()
  closingBalanceCents!: number;
}
