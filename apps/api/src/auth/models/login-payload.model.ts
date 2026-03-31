import { Field, ObjectType } from '@nestjs/graphql';
import { ViewerProfileGraph } from '../../families/models/viewer-profile.model';

@ObjectType()
export class LoginPayload {
  @Field()
  accessToken!: string;

  @Field(() => [ViewerProfileGraph], {
    description:
      'Profils adhérents accessibles après connexion (foyer + fiches liées au compte)',
  })
  viewerProfiles!: ViewerProfileGraph[];

  @Field(() => String, {
    nullable: true,
    description:
      'Club lié au contact quand il n’y a pas de profil membre (portail contact MVP)',
  })
  contactClubId?: string | null;
}
