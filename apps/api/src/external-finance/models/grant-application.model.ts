import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { GrantApplicationStatus } from '@prisma/client';

@ObjectType()
export class GrantApplicationGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field(() => GrantApplicationStatus)
  status!: GrantApplicationStatus;

  @Field(() => Int, { nullable: true })
  amountCents!: number | null;
}
