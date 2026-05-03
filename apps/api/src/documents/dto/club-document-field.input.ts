import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { ClubDocumentFieldType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class ClubDocumentFieldInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  page!: number;

  /** Coordonnée X en % (0..1) du coin supérieur gauche. */
  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  /** Coordonnée Y en % (0..1) du coin supérieur gauche (top-down). */
  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;

  /** Largeur en % (0..1). */
  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(1)
  width!: number;

  /** Hauteur en % (0..1). */
  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(1)
  height!: number;

  @Field(() => ClubDocumentFieldType)
  @IsEnum(ClubDocumentFieldType)
  fieldType!: ClubDocumentFieldType;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
