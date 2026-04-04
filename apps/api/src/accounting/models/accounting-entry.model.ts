import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AccountingEntryKind } from '@prisma/client';

@ObjectType()
export class AccountingEntryGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => AccountingEntryKind)
  kind!: AccountingEntryKind;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => ID, { nullable: true })
  paymentId!: string | null;

  @Field()
  occurredAt!: Date;
}
