import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

/**
 * Ajout d'une déclinaison au panier. Comme `PlaceShopOrderLineInput`, on
 * référence la DÉCLINAISON, pas le produit (ADR-0012).
 *
 * CHAQUE champ porte un décorateur class-validator : sans lui, le
 * ValidationPipe (`whitelist` + `forbidNonWhitelisted`) rejetterait la
 * mutation entière avec « property should not exist ». Balayé par
 * dto-validation-whitelist.spec.ts.
 */
@InputType()
export class AddShopCartItemInput {
  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}

@InputType()
export class SetShopCartItemQuantityInput {
  @Field(() => ID)
  @IsUUID()
  itemId!: string;

  /** 0 (ou moins) retire la ligne du panier. */
  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(999)
  quantity!: number;
}
