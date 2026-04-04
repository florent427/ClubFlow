import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod, SubscriptionBillingRhythm } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class OneTimeFeeExceptionalInput {
  @Field(() => ID)
  @IsUUID('4')
  feeId!: string;

  @Field(() => Int)
  @IsInt()
  amountCents!: number;

  @Field(() => String)
  @IsString()
  reason!: string;
}

@InputType()
export class CreateMembershipInvoiceDraftInput {
  @Field(() => ID)
  @IsUUID('4')
  memberId!: string;

  @Field(() => ID)
  @IsUUID('4')
  membershipProductId!: string;

  @Field(() => SubscriptionBillingRhythm)
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm!: SubscriptionBillingRhythm;

  /** Date effet adhésion (prorata si rythme annuel et formule autorise le prorata). */
  @Field(() => String)
  @IsDateString()
  effectiveDate!: string;

  /** Frais uniques (catalogue actif) à ajouter à la facture. */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  oneTimeFeeIds?: string[] | null;

  /** Remises exceptionnelles sur des frais uniques (une entrée par feeId ; feeId doit être dans oneTimeFeeIds). */
  @Field(() => [OneTimeFeeExceptionalInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OneTimeFeeExceptionalInput)
  oneTimeExceptionals?: OneTimeFeeExceptionalInput[] | null;

  /**
   * Surcharge du pourcentage de saison à payer (points de base, 10_000 = 100 %).
   * Si absent, calcul automatique selon la saison.
   */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  prorataPercentBp?: number | null;

  /** Réduction aide publique (centimes, valeur négative). */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  publicAidAmountCents?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  publicAidOrganisme?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  publicAidReference?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  publicAidAttachmentUrl?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  exceptionalAmountCents?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  exceptionalReason?: string | null;
}

@InputType()
export class FinalizeMembershipInvoiceInput {
  @Field(() => ID)
  @IsUUID('4')
  invoiceId!: string;

  @Field(() => ClubPaymentMethod)
  @IsEnum(ClubPaymentMethod)
  lockedPaymentMethod!: ClubPaymentMethod;
}
