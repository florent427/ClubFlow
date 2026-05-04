import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Club accessible en tant qu'admin pour l'utilisateur connecté.
 * Renvoyé par la query `myAdminClubs` (utilisée pour le ClubSwitcher
 * et la page /select-club après login).
 *
 * Pour un SUPER_ADMIN : retourne TOUS les clubs (avec role='SUPER_ADMIN').
 * Pour un user normal : retourne ses ClubMembership (rôle réel).
 */
@ObjectType()
export class MyAdminClubGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  slug!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  logoUrl!: string | null;

  @Field({
    description:
      "Rôle effectif : 'SUPER_ADMIN' (vue globale système) ou valeur de MembershipRole (CLUB_ADMIN/STAFF/...).",
  })
  role!: string;

  @Field({
    description:
      "true si listé via systemRole=SUPER_ADMIN (vue globale), false si via membership réel.",
  })
  viaSuperAdmin!: boolean;
}
