import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

@InputType()
export class CreateMembershipProductInput {
  @Field()
  @IsString()
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  baseAmountCents!: number;

  @Field(() => ID)
  @IsUUID('4')
  dynamicGroupId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowProrata?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowFamily?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowPublicAid?: boolean;

  @Field({ nullable: true })
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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  label?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  baseAmountCents?: number;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID('4')
  dynamicGroupId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowProrata?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowFamily?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowPublicAid?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowExceptional?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  exceptionalCapPercentBp?: number | null;
}
