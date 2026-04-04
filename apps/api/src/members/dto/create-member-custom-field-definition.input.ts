import { Field, InputType, Int } from '@nestjs/graphql';
import { MemberCustomFieldType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateMemberCustomFieldDefinitionInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @Field(() => MemberCustomFieldType)
  @IsEnum(MemberCustomFieldType)
  type!: MemberCustomFieldType;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @Field({
    nullable: true,
    description: 'Prévoir l’adhérent (portail) : visible pour consultation / édition future',
  })
  @IsOptional()
  @IsBoolean()
  visibleToMember?: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'JSON tableau de chaînes pour SELECT',
  })
  @IsOptional()
  @IsString()
  optionsJson?: string;
}
