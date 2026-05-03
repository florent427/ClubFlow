import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class QuickEntryResultGraph {
  @Field(() => ID)
  id!: string;

  /** Toujours true pour le moment : la catégorisation IA tourne en background. */
  @Field()
  pendingCategorization!: boolean;
}
