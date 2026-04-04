import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { SponsorshipDealStatus } from '@prisma/client';

@ObjectType()
export class SponsorshipDealGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  sponsorName!: string;

  @Field(() => SponsorshipDealStatus)
  status!: SponsorshipDealStatus;

  @Field(() => Int, { nullable: true })
  amountCents!: number | null;
}
