import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubSurveyStatus } from '@prisma/client';

@ObjectType()
export class ClubSurveyOptionGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  surveyId!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  sortOrder!: number;

  @Field(() => Int)
  responseCount!: number;
}

@ObjectType()
export class ClubSurveyGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  authorUserId!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => ClubSurveyStatus)
  status!: ClubSurveyStatus;

  @Field()
  multipleChoice!: boolean;

  @Field()
  allowAnonymous!: boolean;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  closesAt!: Date | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => [ClubSurveyOptionGraph])
  options!: ClubSurveyOptionGraph[];

  @Field(() => Int)
  totalResponses!: number;

  @Field(() => [ID])
  viewerSelectedOptionIds!: string[];
}
