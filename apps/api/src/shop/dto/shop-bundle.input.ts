import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Une pièce d'un pack : une déclinaison stockée et sa quantité (ADR-0024). */
@InputType()
export class ShopBundleComponentInput {
  @Field(() => ID)
  @IsUUID()
  componentVariantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

/**
 * Composition d'un pack. La liste REMPLACE la précédente ; vide, elle dissout
 * le pack, qui redevient une déclinaison stockée à zéro.
 */
@InputType()
export class SetShopVariantBundleInput {
  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  @Field(() => [ShopBundleComponentInput])
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShopBundleComponentInput)
  components!: ShopBundleComponentInput[];
}
