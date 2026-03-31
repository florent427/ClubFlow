import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';

@ObjectType()
export class ViewerInvoicePaymentSnippetGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => ClubPaymentMethod)
  method!: ClubPaymentMethod;

  @Field()
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  paidByFirstName!: string | null;

  @Field(() => String, { nullable: true })
  paidByLastName!: string | null;
}
