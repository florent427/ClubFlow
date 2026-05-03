import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Réponse d'une auto-inscription "en attente" depuis le portail :
 * AUCUNE fiche `Member` n'est créée à ce stade. Un
 * `MembershipCartPendingItem` est ajouté au cart d'adhésion actif.
 *
 * La création effective du `Member` aura lieu uniquement à la validation
 * du cart par le payeur (`validateCart` → `finalizePendingItems`).
 */
@ObjectType()
export class ViewerPendingRegistrationResultGraph {
  @Field(() => ID)
  pendingItemId!: string;

  @Field(() => ID)
  cartId!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;
}
