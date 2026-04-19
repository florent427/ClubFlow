import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PublicClubGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;
}

@ObjectType()
export class PublicAnnouncementGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field()
  pinned!: boolean;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;
}

@ObjectType()
export class PublicEventGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field()
  startsAt!: Date;

  @Field()
  endsAt!: Date;
}

@ObjectType()
export class PublicBlogPostGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  slug!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  excerpt!: string | null;

  @Field()
  body!: string;

  @Field(() => String, { nullable: true })
  coverImageUrl!: string | null;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;
}

@ObjectType()
export class PublicShopProductGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  imageUrl!: string | null;

  @Field()
  priceCents!: number;
}
