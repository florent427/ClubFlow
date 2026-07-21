import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Ligne de panier telle que la voit le MEMBRE.
 *
 * Aucun champ de quantité de stock : le membre voit `inStock` (booléen), son
 * prix et sa quantité commandée. Rien d'autre — même discipline que
 * `shapeProduct` (ADR-0012). Le test shop-viewer-privacy garde cette frontière.
 */
@ObjectType('ShopCartItem')
export class ShopCartItemGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  variantId!: string;

  @Field(() => ID)
  productId!: string;

  @Field()
  label!: string;

  @Field(() => String, { nullable: true })
  imageUrl!: string | null;

  @Field(() => Int)
  quantity!: number;

  @Field(() => Int)
  unitPriceCents!: number;

  @Field(() => Int)
  lineTotalCents!: number;

  /** Booléen seulement : « en stock » / « épuisé ». Jamais la quantité. */
  @Field(() => Boolean)
  inStock!: boolean;

  /** Article devenu indisponible (produit/déclinaison désactivé) après l'ajout. */
  @Field(() => Boolean)
  unavailable!: boolean;
}

@ObjectType('ShopCart')
export class ShopCartGraph {
  /** Chaîne vide si le panier n'a encore jamais été matérialisé en base. */
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => [ShopCartItemGraph])
  items!: ShopCartItemGraph[];
}

/**
 * Résultat du checkout panier : commande + facture créées, et URL Stripe
 * hébergée pour régler. `installmentsCount` reflète ce que le SERVEUR a
 * accordé (1 ou 3), pas ce que le client a demandé.
 */
@ObjectType('ShopCartCheckout')
export class ShopCartCheckoutGraph {
  @Field(() => ID)
  orderId!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => Int)
  installmentsCount!: number;

  @Field(() => String)
  stripeCheckoutUrl!: string;

  /**
   * URL de SUCCÈS réellement posée sur la session Stripe
   * (`MEMBER_PORTAL_ORIGIN/boutique?paid=1`). Ce n'est PAS l'URL à ouvrir
   * (c'est `stripeCheckoutUrl`) : c'est le préfixe que le client mobile
   * surveille pour refermer le navigateur intégré une fois le paiement fait
   * (`WebBrowser.openAuthSessionAsync(stripeCheckoutUrl, paymentReturnUrl)`).
   * Le web l'ignore. Renseigné à l'identique par le checkout ET le repay.
   */
  @Field(() => String)
  paymentReturnUrl!: string;
}
