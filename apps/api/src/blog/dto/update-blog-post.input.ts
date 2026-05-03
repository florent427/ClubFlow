import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateBlogPostInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

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

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  coverImageUrl?: string;
}
