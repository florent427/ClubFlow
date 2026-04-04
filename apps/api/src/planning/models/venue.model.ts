import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class VenueGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  addressLine!: string | null;
}
