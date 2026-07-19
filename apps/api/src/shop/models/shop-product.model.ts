import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/** Une déclinaison vendable : c'est elle qui porte le stock (ADR-0012). */
@ObjectType()
export class ShopProductVariantGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  productId!: string;

  /** Vraie pour l'unique variante d'un produit sans déclinaison. */
  @Field()
  isDefault!: boolean;

  /** « L / Rouge », null pour la variante par défaut. */
  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => String, { nullable: true })
  sku!: string | null;

  /** Prix réellement appliqué : celui de la variante, sinon celui du produit. */
  @Field(() => Int)
  unitPriceCents!: number;

  /** Faux = stock illimité. */
  @Field()
  trackStock!: boolean;

  /**
   * Quantité vendable. Réservée à l'ADMINISTRATION : le portail membre n'y a
   * pas accès et ne reçoit que `inStock`. Un adhérent n'a pas à savoir qu'il
   * reste deux M, ni à quel niveau le club réapprovisionne.
   */
  @Field(() => Int, { nullable: true })
  available!: number | null;

  @Field(() => Int, { nullable: true })
  onHand!: number | null;

  @Field(() => Int, { nullable: true })
  reorderThreshold!: number | null;

  /** Vrai si la variante peut être commandée maintenant. */
  @Field()
  inStock!: boolean;

  /** Vrai si le stock est passé sous le seuil de réapprovisionnement. */
  @Field()
  belowThreshold!: boolean;

  @Field()
  active!: boolean;
}

@ObjectType()
export class ShopProductGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => String, { nullable: true })
  sku!: string | null;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  imageUrl!: string | null;

  @Field(() => Int)
  priceCents!: number;

  /**
   * @deprecated ADR-0012 — champ DÉRIVÉ, plus une colonne.
   *
   * Somme des `available` des variantes suivies, ou null si aucune ne l'est
   * (ancienne sémantique « illimité »). Conservé pour que les 18 opérations
   * GraphQL existantes — dont 5 sélectionnent `stock` — continuent de
   * compiler et d'afficher un chiffre juste le jour du déploiement.
   *
   * La somme et non le minimum : elle préserve exactement ce qu'affichait la
   * ligne « N en stock ». Elle masque en revanche qu'il ne reste que des XXL,
   * d'où le compteur `variantsBelowThreshold` qui l'accompagne à l'écran.
   */
  @Field(() => Int, { nullable: true })
  stock!: number | null;

  /** Déclinaisons vendables. Toujours au moins une. */
  @Field(() => [ShopProductVariantGraph])
  variants!: ShopProductVariantGraph[];

  /** Vrai si le produit a de vraies déclinaisons (autre que celle par défaut). */
  @Field()
  hasVariants!: boolean;

  /** Prix le plus bas parmi les déclinaisons — « à partir de X € ». */
  @Field(() => Int)
  priceFromCents!: number;

  /** Nombre de déclinaisons sous leur seuil de réapprovisionnement. */
  @Field(() => Int)
  variantsBelowThreshold!: number;

  @Field()
  active!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
