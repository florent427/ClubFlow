import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Exception d'une déclinaison pour une offre fournisseur (ADR-0021 §1) : sa
 * propre référence et/ou son propre prix. Un champ vide hérite de l'offre.
 */
@ObjectType()
export class ShopProductSupplierVariantGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  variantId!: string;

  @Field(() => String, { nullable: true })
  supplierRef!: string | null;

  @Field(() => Int, { nullable: true })
  unitCostCents!: number | null;
}

/**
 * Un fournisseur d'un produit (ADR-0021) : chez qui, à quelle référence et à
 * quel prix le club l'achète. ADMINISTRATION SEULEMENT — c'est le prix d'achat
 * du club.
 */
@ObjectType()
export class ShopProductSupplierGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  supplierId!: string;

  @Field()
  supplierName!: string;

  /** Un fournisseur désactivé ne reçoit plus de commande (ADR-0021 §4). */
  @Field()
  supplierActive!: boolean;

  @Field(() => String, { nullable: true })
  supplierRef!: string | null;

  /** Prix d'achat HT habituel, en CENTIMES. Null = inconnu, jamais « gratuit ». */
  @Field(() => Int, { nullable: true })
  unitCostCents!: number | null;

  /** Colisage : les quantités commandées en sont des multiples. */
  @Field(() => Int)
  packSize!: number;

  /** Vrai pour LE fournisseur choisi du produit — un seul, garanti par la base. */
  @Field()
  preferred!: boolean;

  @Field(() => [ShopProductSupplierVariantGraph])
  variantOverrides!: ShopProductSupplierVariantGraph[];
}

/** Nombre de produits rattachés à un fournisseur (ADR-0021). */
@ObjectType()
export class ShopSupplierProductCountGraph {
  @Field(() => ID)
  supplierId!: string;

  @Field(() => Int)
  productCount!: number;
}
