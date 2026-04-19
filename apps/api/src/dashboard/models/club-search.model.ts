import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SearchMemberHit {
  @Field(() => ID) id!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field(() => String, { nullable: true }) email!: string | null;
}

@ObjectType()
export class SearchContactHit {
  @Field(() => ID) id!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field(() => String, { nullable: true }) email!: string | null;
}

@ObjectType()
export class SearchEventHit {
  @Field(() => ID) id!: string;
  @Field() title!: string;
  @Field() startsAt!: Date;
}

@ObjectType()
export class SearchBlogPostHit {
  @Field(() => ID) id!: string;
  @Field() title!: string;
  @Field() slug!: string;
}

@ObjectType()
export class SearchAnnouncementHit {
  @Field(() => ID) id!: string;
  @Field() title!: string;
}

@ObjectType()
export class ClubSearchResults {
  @Field(() => [SearchMemberHit]) members!: SearchMemberHit[];
  @Field(() => [SearchContactHit]) contacts!: SearchContactHit[];
  @Field(() => [SearchEventHit]) events!: SearchEventHit[];
  @Field(() => [SearchBlogPostHit]) blogPosts!: SearchBlogPostHit[];
  @Field(() => [SearchAnnouncementHit]) announcements!: SearchAnnouncementHit[];
}
