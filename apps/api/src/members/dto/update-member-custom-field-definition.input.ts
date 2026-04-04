import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { MemberCustomFieldType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateMemberCustomFieldDefinitionInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @Field(() => MemberCustomFieldType, { nullable: true })
  @IsOptional()
  @IsEnum(MemberCustomFieldType)
  type?: MemberCustomFieldType;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  visibleToMember?: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'null pour effacer les options (si type le permet)',
  })
  @IsOptional()
  @IsString()
  optionsJson?: string | null;
}
