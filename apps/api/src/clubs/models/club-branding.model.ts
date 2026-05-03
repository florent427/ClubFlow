import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Palette couleurs du club (issue de `Club.vitrinePaletteJson`).
 *
 * Les noms de champs correspondent aux clés utilisées par le site vitrine
 * (Tailwind-like). Le client (web ou mobile) mappe ce qu'il veut sur sa
 * propre structure (ex : `accent`/`goldBright` deviennent la couleur
 * primaire d'un bouton sur mobile).
 *
 * Toutes les couleurs sont en hex `#rrggbb` ; null = pas surchargé,
 * laisser le défaut de la plateforme.
 */
@ObjectType({ description: "Palette couleurs personnalisée d'un club." })
export class ClubBrandingPaletteGql {
  @Field(() => String, { nullable: true, description: 'Texte principal.' })
  ink!: string | null;

  @Field(() => String, { nullable: true, description: 'Texte secondaire.' })
  ink2!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Fond / surface de page.',
  })
  paper!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Accent principal (souvent CTA).',
  })
  accent!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Doré vif — utilisé pour highlights premium.',
  })
  goldBright!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Vermillon — accent secondaire chaud.',
  })
  vermillion!: string | null;

  @Field(() => String, { nullable: true, description: 'Couleur des lignes.' })
  line!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Texte muet / hint.',
  })
  muted!: string | null;
}

/**
 * Branding du club exposé au membre / mobile pour personnaliser
 * l'identité visuelle (couleurs, logo, nom, tagline).
 *
 * Disponible à tout User authentifié sur un club via `clubBranding`.
 */
@ObjectType({ description: 'Identité visuelle du club (couleurs + logo).' })
export class ClubBrandingGql {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  logoUrl!: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Tagline / signature courte du club.',
  })
  tagline!: string | null;

  @Field(() => ClubBrandingPaletteGql, { nullable: true })
  palette!: ClubBrandingPaletteGql | null;
}
