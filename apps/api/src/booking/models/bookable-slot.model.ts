import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BookableSlotGraph {
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

  @Field(() => Int, { nullable: true })
  bookingCapacity!: number | null;

  @Field({ nullable: true })
  bookingOpensAt!: Date | null;

  @Field({ nullable: true })
  bookingClosesAt!: Date | null;

  @Field(() => Int)
  bookedCount!: number;

  @Field(() => Int)
  waitlistCount!: number;

  @Field(() => String, { nullable: true })
  viewerBookingStatus!: string | null;
}

@ObjectType()
export class SlotBookingGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  memberId!: string;

  @Field()
  status!: string;

  @Field()
  bookedAt!: Date;

  @Field({ nullable: true })
  cancelledAt!: Date | null;

  @Field({ nullable: true })
  note!: string | null;

  @Field()
  displayName!: string;
}
