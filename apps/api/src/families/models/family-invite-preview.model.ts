import { Field, ObjectType } from '@nestjs/graphql';
import { FamilyInviteRole } from '@prisma/client';

@ObjectType()
export class FamilyInvitePreviewGraph {
  @Field(() => FamilyInviteRole)
  role!: FamilyInviteRole;

  @Field(() => String, { nullable: true })
  familyLabel!: string | null;

  @Field(() => String, { nullable: true })
  inviterFirstName!: string | null;

  @Field(() => String, { nullable: true })
  inviterLastName!: string | null;

  @Field(() => String, { nullable: true })
  clubName!: string | null;

  @Field(() => Date)
  expiresAt!: Date;
}
