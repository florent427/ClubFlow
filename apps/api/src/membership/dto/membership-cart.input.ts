import { Field, ID, InputType, Int, registerEnumType } from '@nestjs/graphql';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ClubPaymentMethod,
  MembershipCartStatus,
  SubscriptionBillingRhythm,
} from '@prisma/client';

registerEnumType(ClubPaymentMethod, { name: 'ClubPaymentMethod' });

@InputType()
export class OpenMembershipCartInput {
  @Field(() => ID)
  @IsUUID()
  clubSeasonId!: string;

  /** Admin : famille cible ; viewer : déduit de l'identité. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  familyId?: string | null;
}

@InputType()
export class UpdateMembershipCartItemInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;

  @Field(() => SubscriptionBillingRhythm, { nullable: true })
  @IsOptional()
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm?: SubscriptionBillingRhythm | null;

  /** Admin : assignation manuelle d'une formule si l'auto-match a échoué. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  membershipProductId?: string | null;

  /** Admin : frais uniques additionnels (IDs) au-delà des `autoApply`. */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  oneTimeFeeOverrideIds?: string[] | null;
}

@InputType()
export class ToggleCartItemLicenseInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;

  @Field(() => Boolean)
  @IsBoolean()
  hasExistingLicense!: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  existingLicenseNumber?: string | null;
}

@InputType()
export class ApplyCartItemExceptionalDiscountInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;

  @Field(() => Int)
  @IsInt()
  amountCents!: number;

  @Field(() => String)
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}

@InputType()
export class ValidateMembershipCartInput {
  @Field(() => ID)
  @IsUUID()
  cartId!: string;

  @Field(() => ClubPaymentMethod, { nullable: true })
  @IsOptional()
  @IsEnum(ClubPaymentMethod)
  lockedPaymentMethod?: ClubPaymentMethod | null;
}

@InputType()
export class CancelMembershipCartInput {
  @Field(() => ID)
  @IsUUID()
  cartId!: string;

  @Field(() => String)
  @IsString()
  @MaxLength(500)
  reason!: string;
}

@InputType()
export class ListMembershipCartsFilter {
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  seasonId?: string | null;

  @Field(() => MembershipCartStatus, { nullable: true })
  @IsOptional()
  @IsEnum(MembershipCartStatus)
  status?: MembershipCartStatus | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  familyId?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  onlyWithAlerts?: boolean | null;
}
