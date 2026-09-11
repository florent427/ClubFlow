import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  BankStatementFormat,
  BankStatementLineIgnoreReason,
  CategorizationDirection,
  CategorizationMatchKind,
} from '@prisma/client';
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

@InputType()
export class AnswerBankLineQuestionInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field({ description: 'Réponse du trésorier à la question posée.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  answer!: string;
}

@InputType()
export class AcceptBankLineProposalInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => String, { nullable: true, description: 'Compte retenu, s’il diffère du compte proposé.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;
}

@InputType()
export class UpsertCategorizationRuleInput {
  @Field(() => ID, { nullable: true, description: 'Absent = création.' })
  @IsOptional()
  @IsUUID()
  id?: string | null;

  @Field({ description: 'Motif confronté au libellé normalisé de la ligne.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  pattern!: string;

  @Field(() => CategorizationMatchKind)
  @IsEnum(CategorizationMatchKind)
  matchKind!: CategorizationMatchKind;

  @Field(() => CategorizationDirection)
  @IsEnum(CategorizationDirection)
  direction!: CategorizationDirection;

  @Field()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  accountCode!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @Field(() => String, { nullable: true, description: 'Libellé d’écriture ; à défaut celui de la ligne.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean | null;
}

@InputType()
export class BankTransferAllocationInput {
  @Field(() => ID)
  @IsUUID()
  invoiceId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @Field(() => ID, { nullable: true, description: 'Membre payeur, s’il est identifié.' })
  @IsOptional()
  @IsUUID()
  paidByMemberId?: string | null;

  @Field(() => ID, { nullable: true, description: 'Contact payeur, s’il est identifié.' })
  @IsOptional()
  @IsUUID()
  paidByContactId?: string | null;
}

@InputType()
export class AcceptBankLineMemberPaymentInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => [BankTransferAllocationInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => BankTransferAllocationInput)
  allocations!: BankTransferAllocationInput[];
}
