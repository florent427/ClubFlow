import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerFamilyMemberSnippetGraph {
  @Field(() => ID)
  memberId!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @Field(() => String, { nullable: true })
  photoUrl!: string | null;
}
