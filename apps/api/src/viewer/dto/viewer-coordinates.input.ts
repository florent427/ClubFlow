import { Field, ID, InputType, registerEnumType } from '@nestjs/graphql';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * Bornes de forme seulement : le fond (portable valide, adresse complète,
 * lieu de naissance) est contrôlé par `common/coordinates`, qui produit des
 * messages lisibles pour le portail.
 */
export const COORDINATE_LIMITS = {
  phone: 32,
  addressLine: 200,
  postalCode: 20,
  city: 100,
  birthCity: 120,
  inseeCode: 5,
  countryCode: 2,
} as const;

export enum ViewerCoordinatesTarget {
  /** Le compte payeur connecté (Contact ou Member actif). */
  ACCOUNT = 'ACCOUNT',
  /** Une inscription en attente du panier du foyer. */
  PENDING_ITEM = 'PENDING_ITEM',
  /** Un adhérent existant du foyer (renouvellement). */
  MEMBER = 'MEMBER',
}

registerEnumType(ViewerCoordinatesTarget, {
  name: 'ViewerCoordinatesTarget',
});

@InputType()
export class ViewerUpdateCoordinatesInput {
  @Field(() => ViewerCoordinatesTarget)
  @IsEnum(ViewerCoordinatesTarget)
  target!: ViewerCoordinatesTarget;

  /** Identifiant de l'inscription en attente ou du membre ; absent pour ACCOUNT. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  targetId?: string | null;

  @Field(() => String, { description: 'Portable au format E.164 (+262…).' })
  @IsString()
  @Length(1, COORDINATE_LIMITS.phone)
  phone!: string;

  @Field(() => String)
  @IsString()
  @Length(1, COORDINATE_LIMITS.addressLine)
  addressLine!: string;

  @Field(() => String)
  @IsString()
  @Length(1, COORDINATE_LIMITS.postalCode)
  postalCode!: string;

  @Field(() => String)
  @IsString()
  @Length(1, COORDINATE_LIMITS.city)
  city!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.birthCity)
  birthCity?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.inseeCode)
  birthCityInseeCode?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.countryCode)
  birthCountryCode?: string | null;
}
