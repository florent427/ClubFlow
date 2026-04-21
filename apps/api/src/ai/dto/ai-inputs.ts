import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

@InputType()
export class UpdateAiSettingsInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  textModel?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  imageModel?: string | null;
}

@InputType()
export class GenerateVitrineArticleDraftInput {
  @Field()
  @IsString()
  @Length(20, 8000)
  sourceText!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tone?: string;

  /** True = générer l'image mise en avant via IA. */
  @Field({ defaultValue: true })
  @IsOptional()
  @IsBoolean()
  generateFeaturedImage?: boolean;

  /** Nombre d'images inline à générer (0 à 6). */
  @Field(() => Int, { defaultValue: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  inlineImageCount?: number;
}
