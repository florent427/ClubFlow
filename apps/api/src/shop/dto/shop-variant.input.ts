import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Un axe et ses valeurs (« Taille » → L, M, S). */
@InputType()
export class ShopProductOptionAxisInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @Field(() => [String])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  values!: string[];
}

@InputType()
export class SetShopProductOptionsInput {
  @Field(() => ID)
  productId!: string;

  /**
   * Liste COMPLÈTE des axes : un axe absent est supprimé. Une liste vide
   * ramène le produit à l'état simple.
   */
  @Field(() => [ShopProductOptionAxisInput])
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ShopProductOptionAxisInput)
  axes!: ShopProductOptionAxisInput[];
}

/**
 * Champs DESCRIPTIFS d'une déclinaison.
 *
 * Ni `onHand` ni `available` : toute écriture de stock passe par les mutations
 * dédiées, qui délèguent au moteur (ADR-0012). Les exposer ici ouvrirait un
 * second chemin de décrément.
 */
@InputType()
export class UpdateShopProductVariantInput {
  @Field(() => ID)
  variantId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string | null;

  /** Prix ABSOLU. Null = hérite du produit (ADR-0012 §6). */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number | null;

  /** Faux = stock illimité. */
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  /** Null = plus jamais d'alerte sur cette déclinaison. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderThreshold?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  reorderTargetQty?: number | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@InputType()
export class RestockShopVariantInput {
  @Field(() => ID)
  variantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  qty!: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

@InputType()
export class AdjustShopVariantStockInput {
  @Field(() => ID)
  variantId!: string;

  /** Ce que l'admin a COMPTÉ, pas un delta : le moteur calcule l'écart. */
  @Field(() => Int)
  @IsInt()
  @Min(0)
  countedOnHand!: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

@InputType()
export class RecordShopVariantShrinkageInput {
  @Field(() => ID)
  variantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  qty!: number;

  /** Obligatoire : une perte sans motif ne s'explique plus six mois après. */
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  reason!: string;
}
