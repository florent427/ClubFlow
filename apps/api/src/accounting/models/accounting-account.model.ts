import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AccountingAccountKind } from '@prisma/client';

@ObjectType()
export class AccountingAccountGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  label!: string;

  @Field(() => AccountingAccountKind)
  kind!: AccountingAccountKind;

  @Field()
  isDefault!: boolean;

  @Field()
  isActive!: boolean;

  @Field(() => Int)
  sortOrder!: number;
}

@ObjectType()
export class AccountingAccountMappingGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  sourceType!: string;

  @Field(() => ID, { nullable: true })
  sourceId!: string | null;

  @Field()
  accountCode!: string;
}
