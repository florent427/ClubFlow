import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { MembershipPricingRulePattern } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateMembershipPricingRuleInput {
  @Field(() => MembershipPricingRulePattern)
  @IsEnum(MembershipPricingRulePattern)
  pattern!: MembershipPricingRulePattern;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  /**
   * Config sérialisée en JSON. Le service parse + valide selon `pattern`.
   * Refusé si invalide (BadRequestException avec message détaillé).
   */
  @Field()
  @IsString()
  configJson!: string;
}

@InputType()
export class UpdateMembershipPricingRuleInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  configJson?: string;
}
