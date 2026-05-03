import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MemberCivility, SubscriptionBillingRhythm } from '@prisma/client';

@InputType()
export class ViewerUpdateCartItemInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;

  @Field(() => SubscriptionBillingRhythm, { nullable: true })
  @IsOptional()
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm?: SubscriptionBillingRhythm | null;
}

@InputType()
export class ViewerToggleCartItemLicenseInput {
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

/**
 * Mise à jour d'une inscription en attente du panier (Member pas
 * encore créé). On autorise la modification des formules choisies et
 * du rythme de règlement. L'identité (prénom, nom, date de naissance,
 * civilité) reste figée — pour la corriger, l'utilisateur retire le
 * pending et l'ajoute à nouveau.
 */
@InputType()
export class ViewerUpdateCartPendingItemInput {
  @Field(() => ID)
  @IsUUID()
  pendingItemId!: string;

  /**
   * Formules d'adhésion sélectionnées. Au moins 1, max 10. Multi-formules
   * supportées (ex Karaté + Cross Training).
   */
  @Field(() => [ID])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  membershipProductIds!: string[];

  @Field(() => SubscriptionBillingRhythm)
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm!: SubscriptionBillingRhythm;
}

@InputType()
export class ViewerRegisterSelfAsMemberInput {
  @Field(() => MemberCivility)
  @IsEnum(MemberCivility)
  civility!: MemberCivility;

  @Field(() => String)
  @IsString()
  birthDate!: string;

  /**
   * Formules d'adhésion sélectionnées par l'utilisateur. Au moins 1.
   * Multi-sélection autorisée (ex Karaté + Cross Training).
   */
  @Field(() => [ID])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  membershipProductIds!: string[];

  /**
   * Rythme de règlement souhaité. Default ANNUAL côté backend si omis.
   */
  @Field(() => SubscriptionBillingRhythm, { nullable: true })
  @IsOptional()
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm?: SubscriptionBillingRhythm | null;
}
