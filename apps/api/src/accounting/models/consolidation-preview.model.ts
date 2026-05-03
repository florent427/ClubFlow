import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ConsolidationGroupGraph {
  @Field()
  accountCode!: string;

  @Field()
  accountLabel!: string;

  @Field(() => Int)
  lineCount!: number;

  @Field(() => Int)
  totalCents!: number;
}

@ObjectType()
export class ConsolidationPreviewGraph {
  @Field()
  eligible!: boolean;

  @Field(() => String, { nullable: true })
  reason!: string | null;

  @Field(() => [ConsolidationGroupGraph])
  groups!: ConsolidationGroupGraph[];
}
