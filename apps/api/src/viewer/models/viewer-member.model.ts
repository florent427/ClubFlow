import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MemberCivility } from '@prisma/client';

@ObjectType()
export class ViewerMemberGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field(() => String, { nullable: true })
  photoUrl!: string | null;

  @Field(() => MemberCivility)
  civility!: MemberCivility;

  @Field(() => Date, { nullable: true })
  medicalCertExpiresAt!: Date | null;

  @Field(() => ID, { nullable: true })
  gradeLevelId!: string | null;

  @Field(() => String, { nullable: true })
  gradeLevelLabel!: string | null;

  @Field()
  canAccessClubBackOffice!: boolean;

  /** Club à passer au back-office (`X-Club-Id`) lors du switch depuis le portail. */
  @Field(() => ID, { nullable: true })
  adminWorkspaceClubId!: string | null;
}
