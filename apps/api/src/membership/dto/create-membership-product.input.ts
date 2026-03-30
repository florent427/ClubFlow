import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

@InputType()
export class CreateMembershipProductInput {
  @Field(() => String)
  @IsString()
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  annualAmountCents!: number;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  monthlyAmountCents!: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  minAge?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  maxAge?: number | null;

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  gradeLevelIds?: string[];

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowProrata?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowFamily?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowPublicAid?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowExceptional?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  exceptionalCapPercentBp?: number | null;
}

@InputType()
export class UpdateMembershipProductInput {
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
  annualAmountCents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyAmountCents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  minAge?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  maxAge?: number | null;

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  gradeLevelIds?: string[];

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowProrata?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowFamily?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowPublicAid?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  allowExceptional?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  exceptionalCapPercentBp?: number | null;
}
