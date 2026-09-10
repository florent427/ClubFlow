import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

/** Pourquoi un membre fait partie du groupe. */
export enum DynamicGroupMemberSource {
  /** Correspond aux critères (âge, grade). */
  CRITERIA = 'CRITERIA',
  /** Ajouté à la main (fiche ou écran du groupe). */
  MANUAL = 'MANUAL',
  /** Les deux : retirer l'affectation manuelle ne le sort pas du groupe. */
  BOTH = 'BOTH',
}
registerEnumType(DynamicGroupMemberSource, {
  name: 'DynamicGroupMemberSource',
});

@ObjectType()
export class DynamicGroupMemberGraph {
  @Field(() => ID)
  memberId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field(() => String, { nullable: true })
  gradeLabel!: string | null;

  @Field(() => DynamicGroupMemberSource)
  source!: DynamicGroupMemberSource;
}
