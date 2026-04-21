import { Field, ID, InputType } from '@nestjs/graphql';
import {
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

@InputType()
export class ViewerRegisterSelfAsMemberInput {
  @Field(() => MemberCivility)
  @IsEnum(MemberCivility)
  civility!: MemberCivility;

  @Field(() => String)
  @IsString()
  birthDate!: string;
}
