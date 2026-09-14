import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Réapprovisionnement (ADR-0021 §4).
 *
 * TOUT champ porte un décorateur class-validator : le ValidationPipe global
 * tourne en `whitelist` + `forbidNonWhitelisted`, et un champ nu serait rejeté
 * comme propriété inconnue.
 */

/** Une ligne de l'aperçu, telle que l'admin l'a validée. */
@InputType()
export class ShopRestockOrderLineInput {
  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  /** Le fournisseur chez qui commander : revalidé, actif et rattaché au produit. */
  @Field(() => ID)
  @IsUUID()
  supplierId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(100_000)
  qty!: number;

  /** Prix d'achat HT en centimes. Absent : celui du fournisseur pour la déclinaison. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unitCostCents?: number | null;
}

@InputType()
export class CreateShopRestockOrdersInput {
  @Field(() => [ShopRestockOrderLineInput])
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ShopRestockOrderLineInput)
  lines!: ShopRestockOrderLineInput[];
}
