import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';
import { SystemRole } from '@prisma/client';

@ObjectType()
export class SystemUserGql {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  displayName!: string;

  @Field(() => SystemRole, { nullable: true })
  systemRole!: SystemRole | null;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}
