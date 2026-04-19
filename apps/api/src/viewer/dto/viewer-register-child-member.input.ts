import { Field, ID, InputType } from '@nestjs/graphql';
import { MemberCivility, SubscriptionBillingRhythm } from '@prisma/client';
import {
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

  /** Formule d'adhésion choisie — génère une facture DRAFT que l'admin finalise. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID('4')
  membershipProductId?: string;

  @Field(() => SubscriptionBillingRhythm, { nullable: true })
  @IsOptional()
  @IsEnum(SubscriptionBillingRhythm)
  billingRhythm?: SubscriptionBillingRhythm;
}
