import { Field, ID, ObjectType } from '@nestjs/graphql';
import { BlogPostStatus } from '@prisma/client';

@ObjectType()
export class BlogPostGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  authorUserId!: string;

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

  @Field(() => BlogPostStatus)
  status!: BlogPostStatus;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
