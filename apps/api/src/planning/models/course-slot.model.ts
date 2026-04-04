import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CourseSlotGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  venueId!: string;

  @Field(() => ID)
  coachMemberId!: string;

  @Field()
  title!: string;

  @Field()
  startsAt!: Date;

  @Field()
  endsAt!: Date;

  @Field(() => ID, { nullable: true })
  dynamicGroupId!: string | null;
}
