import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

@InputType()
export class CreateMembershipInvoiceDraftInput {
  @Field(() => ID)
  @IsUUID('4')
  memberId!: string;

  @Field(() => ID)
  @IsUUID('4')
  membershipProductId!: string;

  /** Date effet adhésion (prorata). */
  @Field(() => String)
  @IsDateString()
  effectiveDate!: string;

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
