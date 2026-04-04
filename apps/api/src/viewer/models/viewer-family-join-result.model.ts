import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerFamilyJoinResultGraph {
  @Field(() => Boolean)
  success!: boolean;

  @Field(() => String, { nullable: true })
  message!: string | null;

  @Field(() => ID, { nullable: true })
  familyId!: string | null;

  @Field(() => String, { nullable: true })
  familyLabel!: string | null;
}
