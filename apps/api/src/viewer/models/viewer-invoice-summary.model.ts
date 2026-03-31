import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { InvoiceStatus } from '@prisma/client';

@ObjectType()
export class ViewerInvoiceSummaryGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  label!: string;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field(() => Date, { nullable: true })
  dueAt!: Date | null;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => Int)
  totalPaidCents!: number;

  @Field(() => Int)
  balanceCents!: number;
}
