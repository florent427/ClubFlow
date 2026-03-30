import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod, InvoiceStatus } from '@prisma/client';

@ObjectType()
export class InvoiceGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID, { nullable: true })
  familyId!: string | null;

  @Field(() => ID, { nullable: true })
  clubSeasonId!: string | null;

  @Field()
  label!: string;

  @Field(() => Int)
  baseAmountCents!: number;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field(() => ClubPaymentMethod, { nullable: true })
  lockedPaymentMethod!: ClubPaymentMethod | null;

  @Field(() => Date, { nullable: true })
  dueAt!: Date | null;
}
