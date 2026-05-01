import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

@InputType()
export class ConfirmExtractionLineAmountInput {
  @Field(() => ID)
  @IsUUID()
  lineId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  amountCents!: number;
}

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

  /**
   * Mode de paiement (compta analytique) : CASH, CHECK, TRANSFER, CARD,
   * DIRECT_DEBIT, OTHER, ou null pour effacer. String libre — la
   * validation des valeurs se fait côté client.
   */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentMethod?: string | null;

  /** N° chèque / virement / autre référence textuelle. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string | null;

  /**
   * Montants par ligne (utilisé pour la propagation auto quand le
   * total change ET qu'il y a plusieurs lignes débit). Si fourni,
   * remplace les montants individuels des lignes correspondantes.
   * Le service vérifie que la somme = `amountCents` (header) à ±2 cts.
   */
  @Field(() => [ConfirmExtractionLineAmountInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmExtractionLineAmountInput)
  lineAmounts?: ConfirmExtractionLineAmountInput[];
}
