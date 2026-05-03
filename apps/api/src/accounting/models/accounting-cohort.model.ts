import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AccountingCohortGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  label!: string;

  @Field(() => Int, { nullable: true })
  minAge!: number | null;

  @Field(() => Int, { nullable: true })
  maxAge!: number | null;

  @Field(() => Int)
  sortOrder!: number;

  @Field()
  isDefault!: boolean;
}
