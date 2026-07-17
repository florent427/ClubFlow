import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateEventInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Field(() => Date)
  @IsDate()
  startsAt!: Date;

  @Field(() => Date)
  @IsDate()
  endsAt!: Date;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  registrationOpensAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  registrationClosesAt?: Date;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  allowContactRegistration?: boolean;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;

  /** Événement public : landing d'inscription sur le site vitrine. */
  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** Slug de la landing — dérivé du titre si absent quand isPublic. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  publicSlug?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  publicHeadline?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  publicDescription?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  publicCtaLabel?: string;

  /** Id du MediaAsset de l'image d'illustration (uploadé via /media/upload). */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  coverMediaAssetId?: string;
}
