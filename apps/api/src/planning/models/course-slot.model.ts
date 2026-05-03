import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

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

  @Field({ defaultValue: false })
  bookingEnabled!: boolean;

  @Field(() => Int, { nullable: true })
  bookingCapacity!: number | null;

  @Field(() => Date, { nullable: true })
  bookingOpensAt!: Date | null;

  @Field(() => Date, { nullable: true })
  bookingClosesAt!: Date | null;

  @Field(() => Int, { defaultValue: 0 })
  bookedCount!: number;

  @Field(() => Int, { defaultValue: 0 })
  waitlistCount!: number;

  @Field(() => String, { nullable: true })
  viewerBookingStatus!: string | null;
}
