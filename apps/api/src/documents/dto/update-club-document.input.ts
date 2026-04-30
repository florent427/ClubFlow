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
export class UpdateClubDocumentInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Field(() => ClubDocumentCategory, { nullable: true })
  @IsOptional()
  @IsEnum(ClubDocumentCategory)
  category?: ClubDocumentCategory;

  /**
   * Si fourni, déclenche un bump de version + invalidation des signatures
   * existantes. Sinon update simple des metadata.
   */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validFrom?: Date;

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
