import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ClubSeasonGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  label!: string;

  @Field(() => Date)
  startsOn!: Date;

  @Field(() => Date)
  endsOn!: Date;

  @Field()
  isActive!: boolean;
}
