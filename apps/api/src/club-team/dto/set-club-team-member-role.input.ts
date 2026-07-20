import { Field, ID, InputType } from '@nestjs/graphql';
import { MembershipRole } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

/** Changement de rôle d'un accès back-office existant. */
@InputType()
export class SetClubTeamMemberRoleInput {
  @Field(() => ID)
  @IsUUID('4')
  membershipId!: string;

  @Field(() => MembershipRole)
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}
