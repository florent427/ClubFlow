import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ViewerFamilyMemberSnippetGraph } from './viewer-family-member-snippet.model';

/** Un foyer résidence rattaché au même groupe foyer étendu. */
@ObjectType()
export class ViewerLinkedHouseholdFamilyGraph {
  @Field(() => ID)
  familyId!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => [ViewerFamilyMemberSnippetGraph])
  members!: ViewerFamilyMemberSnippetGraph[];
}
