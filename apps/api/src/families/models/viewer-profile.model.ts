import { Field, ID, ObjectType } from '@nestjs/graphql';

/** Profil affichable pour l’utilisateur connecté (type Netflix / Phase C). */
@ObjectType()
export class ViewerProfileGraph {
  @Field(() => ID, {
    nullable: true,
    description: 'Présent pour une fiche adhérent liée au compte.',
  })
  memberId!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Présent pour un payeur contact sans fiche adhérent.',
  })
  contactId!: string | null;

  @Field(() => ID)
  clubId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  /** Profil principal (payeur du foyer) ou membre seul lié au compte. */
  @Field()
  isPrimaryProfile!: boolean;

  @Field(() => ID, {
    nullable: true,
    description: 'Présent lorsque le profil appartient à un foyer enregistré',
  })
  familyId!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Groupe foyer étendu lorsque le profil en dépend.',
  })
  householdGroupId!: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'URL de la photo de profil (Member.photoUrl ou Contact.photoUrl). ' +
      'Utilisé par le sélecteur de profil mobile pour afficher un avatar ' +
      'au lieu d\'une simple chip avec initiales.',
  })
  photoUrl!: string | null;
}
