import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';

/**
 * Résultat de `viewerCheckoutMembershipCart` : validation du panier
 * + verrouillage du mode de règlement en une seule mutation.
 *
 * Côté front, on lit selon la méthode :
 *  - STRIPE_CARD → `stripeCheckoutUrl` non null → window.location.assign
 *  - MANUAL_*    → `instructions` non null → afficher dans la modale
 */
@ObjectType('ViewerCheckoutMembershipCart')
export class ViewerCheckoutMembershipCartGraph {
  @Field(() => ID)
  cartId!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field(() => Int)
  installmentsCount!: number;

  /** URL hébergée Stripe Checkout (uniquement pour STRIPE_CARD). */
  @Field(() => String, { nullable: true })
  stripeCheckoutUrl!: string | null;

  /** Texte d'instructions de paiement (uniquement pour méthodes manuelles). */
  @Field(() => String, { nullable: true })
  instructions!: string | null;
}
