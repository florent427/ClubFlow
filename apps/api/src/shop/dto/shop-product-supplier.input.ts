import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Fournisseurs d'un produit (ADR-0021).
 *
 * TOUT champ porte un décorateur class-validator : le ValidationPipe global
 * tourne en `whitelist` + `forbidNonWhitelisted`, et un champ nu serait rejeté
 * comme propriété inconnue.
 */

/**
 * Rattache un fournisseur à un produit, ou met à jour l'offre existante.
 *
 * Un champ ABSENT laisse la valeur en place ; `null` l'efface. C'est ce qui
 * permet de corriger un prix sans renvoyer la référence.
 */
@InputType()
export class UpsertShopProductSupplierInput {
  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field(() => ID)
  @IsUUID()
  supplierId!: string;

  /** Référence de l'article chez le fournisseur. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierRef?: string | null;

  /** Prix d'achat HT habituel, en CENTIMES. Vide = inconnu, jamais zéro. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unitCostCents?: number | null;

  /** Colisage : le fournisseur vend par multiples de ce nombre. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  packSize?: number | null;
}

@InputType()
export class RemoveShopProductSupplierInput {
  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field(() => ID)
  @IsUUID()
  supplierId!: string;
}

/**
 * Choisit le fournisseur chez qui le réapprovisionnement commandera.
 * `supplierId: null` retire le choix : l'article sort du réapprovisionnement
 * automatique.
 */
@InputType()
export class SetShopProductPreferredSupplierInput {
  @Field(() => ID)
  @IsUUID()
  productId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;
}

/**
 * Exception d'une déclinaison pour une offre : sa propre référence et/ou son
 * propre prix. Les deux vides suppriment l'exception — la déclinaison hérite
 * de nouveau de l'offre.
 */
@InputType()
export class SetShopProductSupplierVariantInput {
  @Field(() => ID)
  @IsUUID()
  offerId!: string;

  @Field(() => ID)
  @IsUUID()
  variantId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierRef?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unitCostCents?: number | null;
}
