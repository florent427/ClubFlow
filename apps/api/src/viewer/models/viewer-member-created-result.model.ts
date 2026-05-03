import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerMemberCreatedResultGraph {
  @Field(() => ID)
  memberId!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;
}
