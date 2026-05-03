import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateShopProductInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
