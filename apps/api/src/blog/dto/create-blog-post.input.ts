import { Field, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateBlogPostInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug invalide (kebab-case attendu)',
  })
  slug?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  coverImageUrl?: string;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
