import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PromoteContactResultGraph {
  @Field(() => ID)
  memberId!: string;
}
