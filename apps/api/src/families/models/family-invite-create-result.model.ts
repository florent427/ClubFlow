import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class FamilyInviteCreateResultGraph {
  @Field(() => String)
  code!: string;

  @Field(() => String)
  rawToken!: string;

  @Field(() => Date)
  expiresAt!: Date;

  @Field(() => ID)
  familyId!: string;
}
