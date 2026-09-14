import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ShopPurchaseOrderGraph } from './shop-purchase.model';

/**
 * Conditions d'achat d'une déclinaison chez un fournisseur, exception appliquée
 * (ADR-0021 §1). ADMINISTRATION SEULEMENT — c'est le prix d'achat du club.
 */
@ObjectType()
export class ShopRestockOfferGraph {
  @Field(() => ID)
  supplierId!: string;

  @Field()
  supplierName!: string;

  @Field()
  supplierActive!: boolean;

  @Field(() => String, { nullable: true })
  supplierRef!: string | null;

  /** Prix d'achat HT en centimes. Null = inconnu, jamais « gratuit ». */
  @Field(() => Int, { nullable: true })
  unitCostCents!: number | null;

  @Field(() => Int)
  packSize!: number;

  /**
   * Le manque de la ligne arrondi au colisage de CE fournisseur : la quantité
   * reprise quand l'admin bascule la ligne vers lui.
   */
  @Field(() => Int)
  suggestedQty!: number;
}

/** Une déclinaison dans le plan de réapprovisionnement (ADR-0021 §3). */
@ObjectType()
export class ShopRestockLineGraph {
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

  /** Stock physique : le vendable, plus ce qui est réservé et pas encore remis. */
  @Field(() => Int)
  onHand!: number;

  @Field(() => Int, { nullable: true })
  reorderThreshold!: number | null;

  @Field(() => Int, { nullable: true })
  reorderTargetQty!: number | null;

  /** Date de l'alerte de seuil déjà envoyée, null si le club n'a pas encore été prévenu. */
  @Field(() => Date, { nullable: true })
  alertedAt!: Date | null;

  /** Commandé chez un fournisseur, pas encore reçu. */
  @Field(() => Int)
  onOrder!: number;

  /** Promis en précommande, en attente d'arrivage. */
  @Field(() => Int)
  preordered!: number;

  /** Déjà porté par un brouillon, chez n'importe quel fournisseur. */
  @Field(() => Int)
  inDraft!: number;

  /** Quantité visée : la cible, à défaut le seuil + 1, à défaut 0. */
  @Field(() => Int)
  target!: number;

  /** Ce qui manque, avant arrondi au colisage. Zéro : déjà couvert. */
  @Field(() => Int)
  shortfall!: number;

  /** Quantité proposée : le manque arrondi au colisage du fournisseur choisi. */
  @Field(() => Int)
  suggestedQty!: number;

  /** Le fournisseur choisi du produit, actif ou non. Null : aucun choix. */
  @Field(() => ShopRestockOfferGraph, { nullable: true })
  supplier!: ShopRestockOfferGraph | null;

  /** Tous les fournisseurs du produit, pour basculer la ligne vers un autre. */
  @Field(() => [ShopRestockOfferGraph])
  offers!: ShopRestockOfferGraph[];
}

@ObjectType()
export class ShopRestockGroupGraph {
  @Field(() => ID)
  supplierId!: string;

  @Field()
  supplierName!: string;

  @Field(() => [ShopRestockLineGraph])
  lines!: ShopRestockLineGraph[];
}

/** Le plan de réapprovisionnement (ADR-0021 §3-4). Calculé à chaque lecture. */
@ObjectType()
export class ShopRestockPlanGraph {
  /** À commander, regroupé par fournisseur choisi et actif. */
  @Field(() => [ShopRestockGroupGraph])
  groups!: ShopRestockGroupGraph[];

  /** À commander, mais aucun fournisseur choisi : jamais commandé en l'état. */
  @Field(() => [ShopRestockLineGraph])
  withoutSupplier!: ShopRestockLineGraph[];

  /** À commander, mais le fournisseur choisi est désactivé. */
  @Field(() => [ShopRestockLineGraph])
  inactiveSupplier!: ShopRestockLineGraph[];

  /** Dans le plan, mais déjà couvert par le stock, l'encours ou un brouillon. */
  @Field(() => [ShopRestockLineGraph])
  covered!: ShopRestockLineGraph[];
}

/** Un brouillon créé ou complété par un réapprovisionnement (ADR-0021 §4). */
@ObjectType()
export class ShopRestockOrderResultGraph {
  /** Vrai : brouillon neuf. Faux : le brouillon déjà ouvert chez ce fournisseur, complété. */
  @Field()
  created!: boolean;

  @Field(() => Int)
  lineCount!: number;

  @Field(() => ShopPurchaseOrderGraph)
  order!: ShopPurchaseOrderGraph;
}
