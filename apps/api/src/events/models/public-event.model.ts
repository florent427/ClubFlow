import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Vue PUBLIQUE d'un événement pour la landing vitrine (visiteur anonyme).
 *
 * Volontairement distincte de `ClubEventGraph` : on n'expose NI la liste
 * des inscrits (données personnelles), NI les compteurs internes — juste
 * ce qu'il faut pour vendre l'événement et réserver un créneau.
 */
@ObjectType()
export class PublicEventProgramItemGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  timeLabel!: string | null;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  /** Créneau sélectionnable dans le formulaire d'inscription. */
  @Field()
  bookable!: boolean;

  /**
   * Places restantes sur ce créneau — null = illimité. Ne descend jamais
   * sous 0 côté serveur.
   */
  @Field(() => Int, { nullable: true })
  remainingSpots!: number | null;

  @Field(() => Int)
  sortOrder!: number;
}

@ObjectType()
export class PublicClubEventGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field()
  startsAt!: Date;

  @Field()
  endsAt!: Date;

  @Field(() => Int, { nullable: true })
  priceCents!: number | null;

  @Field()
  publicSlug!: string;

  @Field(() => String, { nullable: true })
  publicHeadline!: string | null;

  @Field(() => String, { nullable: true })
  publicDescription!: string | null;

  @Field(() => String, { nullable: true })
  publicCtaLabel!: string | null;

  /** Places restantes au niveau de l'événement — null = illimité. */
  @Field(() => Int, { nullable: true })
  remainingSpots!: number | null;

  /** true si la fenêtre d'inscription est ouverte (dates + capacité). */
  @Field()
  registrationOpen!: boolean;

  @Field(() => [PublicEventProgramItemGraph])
  programItems!: PublicEventProgramItemGraph[];
}

/** Résultat générique de l'inscription publique (pas de fuite d'info). */
@ObjectType()
export class PublicEventRegistrationResult {
  @Field()
  success!: boolean;

  @Field(() => String, { nullable: true })
  message!: string | null;
}
