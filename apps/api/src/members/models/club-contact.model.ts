import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('ClubContact')
export class ClubContactGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  userId!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field()
  email!: string;

  @Field()
  emailVerified!: boolean;

  @Field(() => ID, { nullable: true })
  linkedMemberId!: string | null;

  @Field()
  canDeleteContact!: boolean;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}
