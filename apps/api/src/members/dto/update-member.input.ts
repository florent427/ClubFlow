import { Field, ID, InputType } from '@nestjs/graphql';
import { MemberCivility, MemberClubRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MemberCustomFieldValueInput } from './member-custom-field-value.input';

@InputType()
export class UpdateMemberInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @Field(() => MemberCivility, { nullable: true })
  @IsOptional()
  @IsEnum(MemberCivility)
  civility?: MemberCivility | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  birthDate?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(524_288)
  photoUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  medicalCertExpiresAt?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  gradeLevelId?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @Field(() => [MemberClubRole], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsEnum(MemberClubRole, { each: true })
  roles?: MemberClubRole[];

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  customRoleIds?: string[];

  @Field(() => [MemberCustomFieldValueInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberCustomFieldValueInput)
  customFieldValues?: MemberCustomFieldValueInput[];
}
