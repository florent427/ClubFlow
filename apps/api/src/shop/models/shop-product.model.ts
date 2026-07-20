import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

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

  /**
   * Quantité EN COMMANDE chez le fournisseur : somme des reliquats attendus
   * sur les lignes non closes des commandes envoyées (ADR-0013 §4).
   *
   * DÉRIVÉE et jamais stockée. « Il reste 2 M, mais 20 arrivent » est ce qui
   * évite de recommander deux fois. N'autorise JAMAIS une vente — seul
   * `available` le fait ; ne pas confondre les deux.
   *
   * Réservée à l'ADMINISTRATION au même titre qu'`available` : l'encours
   * fournisseur trahit une quantité et la politique d'achat du club.
   */
  @Field(() => Int, { nullable: true })
  onOrder!: number | null;

  /**
   * Coût moyen pondéré d'acquisition, en CENTIMES (ADR-0013 §1).
   *
   * ADMINISTRATION SEULEMENT, comme `available` — et pour une raison de plus :
   * c'est le PRIX D'ACHAT du club. Un adhérent qui le lit sait combien son
   * club marge sur lui ; un fournisseur concurrent sait à combien s'aligner.
   *
   * Zéro se lit « coût jamais saisi », pas « gratuit ».
   */
  @Field(() => Int, { nullable: true })
  avgCostCents!: number | null;

  /** Marge unitaire = `unitPriceCents − avgCostCents`. Admin seulement. */
  @Field(() => Int, { nullable: true })
  marginCents!: number | null;

  /**
   * Taux de marge = marge / prix de vente. Null si le prix est nul — un
   * article offert n'a pas un taux infini, il n'en a pas. Admin seulement.
   */
  @Field(() => Float, { nullable: true })
  marginRate!: number | null;

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

  /**
   * Valeur du stock au coût moyen pondéré : somme des `onHand × avgCostCents`
   * des déclinaisons SUIVIES (ADR-0013 §1).
   *
   * REPORTING seulement : aucun compte de stock `3xx` n'existe au plan
   * comptable, et il ne doit pas en apparaître pour ce chiffre. Neutralisé
   * hors administration au même titre que `stock` — il en dérive.
   */
  @Field(() => Int, { nullable: true })
  stockValueCents!: number | null;

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
