import { Field, ID, InputType } from '@nestjs/graphql';
import { MemberCivility, SubscriptionBillingRhythm } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

@InputType()
export class ViewerPromoteSelfToMemberInput {
  @Field(() => MemberCivility)
  @IsEnum(MemberCivility)
  civility!: MemberCivility;

  @Field({ nullable: true, description: 'Date de naissance ISO (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

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
