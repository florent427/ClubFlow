import { Field, InputType, Int } from '@nestjs/graphql';
import { MemberCatalogFieldKey } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';

@InputType()
export class UpsertClubMemberCatalogFieldSettingInput {
  @Field(() => MemberCatalogFieldKey)
  @IsEnum(MemberCatalogFieldKey)
  fieldKey!: MemberCatalogFieldKey;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  showOnForm?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
