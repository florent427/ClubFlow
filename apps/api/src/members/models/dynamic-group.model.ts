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
      'Nombre de membres actifs dont âge / grade correspondent aux critères du groupe (date de référence : maintenant).',
  })
  matchingActiveMembersCount!: number;
}
