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
  ValidateNested,
} from 'class-validator';
import { MemberCustomFieldValueInput } from './member-custom-field-value.input';

@InputType()
export class CreateMemberInput {
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

  @Field()
  @IsEmail()
  @MaxLength(320)
  email!: string;

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

  @Field({ nullable: true })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

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
  gradeLevelId?: string;

  @Field(() => ID, { nullable: true, description: 'Compte utilisateur lié (optionnel)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @Field(() => [MemberClubRole], {
    nullable: true,
    description: 'Défaut : [STUDENT] si vide',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MemberClubRole, { each: true })
  roles?: MemberClubRole[];

  @Field(() => [ID], {
    nullable: true,
    description: 'Identifiants de ClubRoleDefinition du club',
  })
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

  @Field(() => ID, {
    nullable: true,
    description:
      'Rattacher dès la création à ce foyer (requis si l’e-mail existe déjà dans ce foyer)',
  })
  @IsOptional()
  @IsUUID()
  familyId?: string;
}
