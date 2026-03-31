import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerFamilyMemberSnippetGraph {
  @Field(() => ID)
  memberId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field(() => String, { nullable: true })
  photoUrl!: string | null;
}
