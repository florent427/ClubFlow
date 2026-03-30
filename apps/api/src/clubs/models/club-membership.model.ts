import { Field, ObjectType } from '@nestjs/graphql';
import { MembershipRole } from '@prisma/client';

@ObjectType()
export class ClubMembershipGraphModel {
  @Field()
  id!: string;

  @Field()
  userId!: string;

  @Field()
  clubId!: string;

  @Field(() => MembershipRole)
  role!: MembershipRole;
}
