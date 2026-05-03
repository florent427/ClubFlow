import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ShopProductGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => String, { nullable: true })
  sku!: string | null;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  imageUrl!: string | null;

  @Field(() => Int)
  priceCents!: number;

  @Field(() => Int, { nullable: true })
  stock!: number | null;

  @Field()
  active!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
