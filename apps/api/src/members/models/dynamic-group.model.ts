import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { GradeLevelGraph } from './grade-level.model';

@ObjectType()
export class DynamicGroupGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  name!: string;

  @Field(() => Int, { nullable: true })
  minAge?: number | null;

  @Field(() => Int, { nullable: true })
  maxAge?: number | null;

  @Field(() => [GradeLevelGraph])
  gradeFilters!: GradeLevelGraph[];

  @Field(() => Int, {
    description:
      'Membres actifs du groupe : critères (âge / grade, date de référence : maintenant) OU affectation manuelle.',
  })
  matchingActiveMembersCount!: number;

  @Field(() => Int, {
    description:
      'Parmi eux, ceux ajoutés à la main (fiche ou écran du groupe), critères remplis ou non.',
  })
  manuallyAssignedCount!: number;
}
