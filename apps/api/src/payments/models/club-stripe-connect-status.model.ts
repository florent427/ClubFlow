import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Miroir local de l'état du compte Stripe Connect Express du club (ADR-0008).
 *
 * Les trois booléens sont non-nullables et valent `false` tant qu'aucun compte
 * n'existe : le back-office affiche ainsi un état « pas encore encaissable »
 * sans avoir à gérer un cas null séparé.
 */
@ObjectType()
export class ClubStripeConnectStatusGraph {
  @Field(() => String, {
    nullable: true,
    description: "Identifiant du compte connecté (acct_xxx). Null tant qu'aucun compte n'a été créé.",
  })
  stripeAccountId!: string | null;

  @Field({ description: 'Le club peut encaisser des paiements.' })
  chargesEnabled!: boolean;

  @Field({ description: 'Le club peut recevoir des virements Stripe.' })
  payoutsEnabled!: boolean;

  @Field({ description: 'Le dossier KYC a été soumis à Stripe.' })
  detailsSubmitted!: boolean;

  @Field(() => Date, {
    nullable: true,
    description:
      "Date du premier passage en encaissable. Null tant que le club n'a jamais pu encaisser.",
  })
  onboardedAt!: Date | null;
}
