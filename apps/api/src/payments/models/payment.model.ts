import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';

@ObjectType()
export class PaymentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field(() => String, { nullable: true })
  externalRef!: string | null;

  @Field(() => ID, { nullable: true })
  paidByMemberId!: string | null;

  @Field()
  createdAt!: Date;
}
