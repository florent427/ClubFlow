import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerCourseSlotGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field()
  startsAt!: Date;

  @Field()
  endsAt!: Date;

  @Field()
  venueName!: string;

  @Field()
  coachFirstName!: string;

  @Field()
  coachLastName!: string;
}
