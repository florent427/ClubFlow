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
  MaxLength,
  MinLength,
} from 'class-validator';

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
