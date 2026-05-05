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

  /**
   * IDs des frais ponctuels OPTIONAL sélectionnés. Vide = aucun OPTIONAL,
   * null = pas de surcharge (laisse le système appliquer les autoApply).
   * Les MANDATORY et LICENSE restent forcées indépendamment.
   */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  oneTimeFeeOverrideIds?: string[] | null;
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
 * Variante pour les inscriptions en attente (Member pas encore créé).
 * Permet au payeur de déclarer une licence existante AVANT validation
 * du panier — sinon il valide au tarif licence puis demande remboursement.
 */
@InputType()
export class ViewerToggleCartPendingItemLicenseInput {
  @Field(() => ID)
  @IsUUID()
  pendingItemId!: string;

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

  /** Override OPTIONAL fees du pending. Vide = aucun OPTIONAL. */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  oneTimeFeeOverrideIds?: string[] | null;
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
