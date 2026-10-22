import { Field, ID, InputType } from '@nestjs/graphql';
import { MemberCivility, SubscriptionBillingRhythm } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { COORDINATE_LIMITS } from './viewer-coordinates.input';

@InputType()
export class ViewerRegisterChildMemberInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @Field(() => MemberCivility)
  @IsEnum(MemberCivility)
  civility!: MemberCivility;

  @Field({ description: 'Date de naissance de l’enfant (ISO YYYY-MM-DD).' })
  @IsDateString()
  birthDate!: string;

  @Field(() => String, { description: 'Ville de naissance (libellé).' })
  @IsString()
  @Length(1, COORDINATE_LIMITS.birthCity)
  birthCity!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Code INSEE de la commune française choisie dans l’autocomplétion.',
  })
  @IsOptional()
  @IsString()
  @Length(0, COORDINATE_LIMITS.inseeCode)
  birthCityInseeCode?: string | null;

  @Field(() => String, { description: 'Pays de naissance, ISO 3166-1 alpha-2.' })
  @IsString()
  @Length(2, COORDINATE_LIMITS.countryCode)
  birthCountryCode!: string;

  /**
   * Coordonnées de l'enfant. Le portail propose de reprendre celles du
   * compte (adresse et portable séparément) ; il envoie alors les valeurs.
   */
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

  /**
   * Formules d'adhésion choisies (1 à N). Multi-formules supporté
   * (ex Karaté + Cross Training).
   */
  @Field(() => [ID])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  membershipProductIds!: string[];

  @Field(() => SubscriptionBillingRhythm, { nullable: true })
  @IsOptional()
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm?: SubscriptionBillingRhythm;
}
