import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Vue publique d'un club, exposée SANS authentification. Utilisée par :
 * - portail web `/register?club=<slug>` pour afficher "Vous rejoignez X"
 * - mobile SelectClub screen pour autocomplete
 *
 * On expose uniquement le minimum identifiant + branding visuel, pas
 * d'info sensible (pas de count membres, pas de FK admin, etc.).
 */
@ObjectType()
export class ClubPublicGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  slug!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  logoUrl!: string | null;

  /** Domaine custom (ex: 'sksr.re'), utilisé pour le branding portail. */
  @Field(() => String, { nullable: true })
  customDomain!: string | null;

  /** Tagline kanji optionnelle (vitrine). */
  @Field(() => String, { nullable: true })
  tagline!: string | null;
}
