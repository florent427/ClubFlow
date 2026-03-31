import { Field, ID, ObjectType } from '@nestjs/graphql';

/** Profil affichable pour l’utilisateur connecté (type Netflix / Phase C). */
@ObjectType()
export class ViewerProfileGraph {
  @Field(() => ID)
  memberId!: string;

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
    description: 'Présent lorsque le membre appartient à un foyer enregistré',
  })
  familyId!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Groupe foyer étendu lorsque le profil en dépend.',
  })
  householdGroupId!: string | null;
}
