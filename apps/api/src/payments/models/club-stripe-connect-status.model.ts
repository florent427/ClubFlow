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

  /**
   * Identité déclarée au KYC Stripe. En direct charges, c'est elle — et non
   * `Club.name` — que l'adhérent lit sur son mandat SEPA et son relevé.
   * Exposée pour que le trésorier vérifie qu'elle est reconnaissable.
   */
  @Field(() => String, {
    nullable: true,
    description:
      "Raison sociale déclarée à Stripe (business_profile.name). Null tant que le KYC ne l'a pas renseignée.",
  })
  businessName!: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'Libellé qui apparaît sur le relevé bancaire du débiteur. Champ distinct de la raison sociale.',
  })
  statementDescriptor!: string | null;

  /**
   * Nom du club côté ClubFlow, renvoyé pour que le client compare sans avoir
   * à recouper deux queries. La comparaison est faite côté front (affichage),
   * pas ici : l'API expose les faits, l'UI décide quoi en dire.
   */
  @Field({ description: 'Nom du club dans ClubFlow, pour comparaison.' })
  clubName!: string;
}
