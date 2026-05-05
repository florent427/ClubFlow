import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { MembershipOneTimeFeeKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class CreateMembershipOneTimeFeeInput {
  @Field(() => String)
  @IsString()
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  amountCents!: number;

  @Field(() => MembershipOneTimeFeeKind, {
    nullable: true,
    description: 'LICENSE / MANDATORY / OPTIONAL — défaut OPTIONAL.',
  })
  @IsOptional()
  @IsEnum(MembershipOneTimeFeeKind)
  kind?: MembershipOneTimeFeeKind;

  /** Auto-coché true si kind=MANDATORY ou LICENSE côté service. */
  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  /** Regex JS pour valider le numéro de licence existante (LICENSE only). */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  licenseNumberPattern?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  licenseNumberFormatHint?: string;
}

@InputType()
export class UpdateMembershipOneTimeFeeInput {
  @Field(() => ID)
  @IsUUID('4')
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  label?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @Field(() => MembershipOneTimeFeeKind, { nullable: true })
  @IsOptional()
  @IsEnum(MembershipOneTimeFeeKind)
  kind?: MembershipOneTimeFeeKind;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  licenseNumberPattern?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  licenseNumberFormatHint?: string;
}
