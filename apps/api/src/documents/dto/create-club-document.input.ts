import { Field, ID, InputType } from '@nestjs/graphql';
import { ClubDocumentCategory } from '@prisma/client';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class CreateClubDocumentInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Field(() => ClubDocumentCategory)
  @IsEnum(ClubDocumentCategory)
  category!: ClubDocumentCategory;

  @Field(() => ID)
  @IsUUID()
  mediaAssetId!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field()
  @IsDate()
  @Type(() => Date)
  validFrom!: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validTo?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  minorsOnly?: boolean;
}
