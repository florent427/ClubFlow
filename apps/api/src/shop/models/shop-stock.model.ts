import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ShopStockMovementKind } from '@prisma/client';

registerEnumType(ShopStockMovementKind, { name: 'ShopStockMovementKind' });

/** Une ligne du journal de stock (ADR-0012 §4). */
@ObjectType()
export class ShopStockMovementGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  variantId!: string;

  @Field(() => ShopStockMovementKind)
  kind!: ShopStockMovementKind;

  /**
   * Deltas SIGNÉS. Le sens vit ici et non dans `kind` : une réservation ne
   * touche que `available` (l'article est encore physiquement là), une sortie
   * au paiement ne touche que `onHand`.
   */
  @Field(() => Int)
  onHandDelta!: number;

  @Field(() => Int)
  availableDelta!: number;

  @Field(() => ID, { nullable: true })
  orderId!: string | null;

  @Field(() => ID, { nullable: true })
  orderLineId!: string | null;

  @Field(() => String, { nullable: true })
  reason!: string | null;

  @Field(() => ID, { nullable: true })
  userId!: string | null;

  @Field()
  occurredAt!: Date;
}

/** Une valeur possible d'un axe de variation (« L », « Rouge »). */
@ObjectType()
export class ShopProductOptionValueGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  value!: string;

  @Field(() => Int)
  position!: number;
}

/** Un axe de variation (« Taille », « Couleur »). */
@ObjectType()
export class ShopProductOptionGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  productId!: string;

  @Field()
  name!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => [ShopProductOptionValueGraph])
  values!: ShopProductOptionValueGraph[];
}

/**
 * Une déclinaison sous son seuil, tous produits confondus.
 *
 * Vue transversale et non par produit : le trésorier veut sa liste de courses,
 * pas vingt fiches à ouvrir une par une.
 */
@ObjectType()
export class ShopLowStockVariantGraph {
  @Field(() => ID)
  variantId!: string;

  @Field(() => ID)
  productId!: string;

  @Field()
  productName!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => String, { nullable: true })
  sku!: string | null;

  @Field(() => Int)
  available!: number;

  @Field(() => Int)
  onHand!: number;

  @Field(() => Int)
  reorderThreshold!: number;

  @Field(() => Int, { nullable: true })
  reorderTargetQty!: number | null;

  /** Date de l'alerte déjà envoyée, null si le club n'a pas encore été prévenu. */
  @Field(() => Date, { nullable: true })
  alertedAt!: Date | null;
}

/** Compte-rendu chiffré d'un balayage des seuils. */
@ObjectType()
export class ShopStockSweepReportGraph {
  @Field(() => Int, { description: 'Déclinaisons suivies et seuillées examinées.' })
  examined!: number;

  @Field(() => Int, { description: 'Alertes réclamées ET effectivement parties.' })
  alerted!: number;

  @Field(() => Int, {
    description: 'Marqueurs remis à zéro : le stock est repassé au-dessus du seuil.',
  })
  rearmed!: number;

  @Field(() => Int, {
    description:
      'Alertes réclamées mais perdues faute d’envoi possible — à surveiller.',
  })
  failed!: number;
}
