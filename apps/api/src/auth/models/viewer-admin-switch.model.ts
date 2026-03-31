import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ViewerAdminSwitchGraph {
  @Field()
  canAccessClubBackOffice!: boolean;

  @Field(() => ID, { nullable: true })
  adminWorkspaceClubId!: string | null;
}
