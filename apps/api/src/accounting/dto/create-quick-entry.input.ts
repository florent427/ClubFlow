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

/**
 * Input pour la création "rapide" : l'écriture est créée immédiatement
 * avec un compte fallback, la catégorisation IA tourne en arrière-plan
 * et met à jour le compte ensuite. Pas de blocage UX pour l'utilisateur.
 *
 * Pas d'`accountCode` requis contrairement à CreateAccountingEntryInput —
 * c'est l'IA qui le proposera.
 */
@InputType()
export class CreateQuickAccountingEntryInput {
  @Field(() => AccountingEntryKind)
  @IsEnum(AccountingEntryKind)
  kind!: AccountingEntryKind;

  @Field(() => String)
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
}
