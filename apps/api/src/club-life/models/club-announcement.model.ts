import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ClubAnnouncementGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  authorUserId!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field()
  pinned!: boolean;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
