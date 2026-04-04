import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MemberCivility } from '@prisma/client';

@ObjectType()
export class ViewerMemberGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
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

  @Field(() => Boolean, {
    description: 'True si cette fiche est déjà rattachée à un foyer du club.',
  })
  hasClubFamily!: boolean;

  @Field(() => Boolean, {
    description:
      'True si l’adhérent peut utiliser le rattachement libre via l’e-mail du payeur (pas encore dans un foyer).',
  })
  canSelfAttachFamilyViaPayerEmail!: boolean;

  @Field(() => Boolean, {
    description: 'Profil portail basé sur un contact payeur (pas une fiche adhérent).',
    defaultValue: false,
  })
  isContactProfile!: boolean;

  /** Masquer progression / planning (payeur contact uniquement). */
  @Field(() => Boolean, { defaultValue: false })
  hideMemberModules!: boolean;
}
