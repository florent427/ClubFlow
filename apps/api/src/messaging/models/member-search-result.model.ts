import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Résultat d'une recherche d'adhérent pour démarrer un chat 1-on-1.
 * Volontairement minimal : on n'expose pas les coordonnées (téléphone /
 * email) pour respecter la vie privée — le chat est le seul canal de
 * contact pair-à-pair entre membres.
 */
@ObjectType('MemberSearchResult')
export class MemberSearchResultGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field(() => String, {
    nullable: true,
    description:
      "Pseudo public (Member.pseudo). Permet l'affichage anonymisé dans les " +
      'salons quand le membre a choisi un pseudo. Null sinon.',
  })
  pseudo!: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'URL de la photo de profil (utilisée pour afficher un avatar dans la ' +
      'liste de résultats). Null si pas de photo.',
  })
  photoUrl!: string | null;
}
