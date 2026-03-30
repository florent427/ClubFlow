import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Club courant (tenant)' })
export class ClubGraphModel {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;
}
