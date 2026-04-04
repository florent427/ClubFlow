import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ClubRoleDefinitionGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  sortOrder!: number;
}
