import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  FamilyMemberLinkRole,
  MemberCivility,
  MemberClubRole,
  MemberStatus,
} from '@prisma/client';
import { ClubRoleDefinitionGraph } from './club-role-definition.model';
import { GradeLevelGraph } from './grade-level.model';
import { MemberCustomFieldValueGraph } from './member-custom-field-value.model';

@ObjectType()
export class MemberFamilySummaryGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;
}

@ObjectType()
export class MemberFamilyLinkSummaryGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => FamilyMemberLinkRole)
  linkRole!: FamilyMemberLinkRole;
}

/** Sous-ensemble pour les groupes dynamiques explicitement assignés au membre. */
@ObjectType()
export class AssignedDynamicGroupGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;
}

@ObjectType()
export class MemberGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID, { nullable: true })
  userId!: string | null;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field(() => MemberCivility)
  civility!: MemberCivility;

  @Field()
  email!: string;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String, { nullable: true })
  addressLine!: string | null;

  @Field(() => String, { nullable: true })
  postalCode!: string | null;

  @Field(() => String, { nullable: true })
  city!: string | null;

  @Field(() => Date, { nullable: true })
  birthDate!: Date | null;

  @Field(() => String, { nullable: true })
  photoUrl!: string | null;

  @Field(() => Date, { nullable: true })
  medicalCertExpiresAt!: Date | null;

  @Field(() => MemberStatus)
  status!: MemberStatus;

  @Field(() => ID, { nullable: true })
  gradeLevelId!: string | null;

  @Field(() => GradeLevelGraph, { nullable: true })
  gradeLevel!: GradeLevelGraph | null;

  @Field(() => [MemberClubRole], {
    description: 'Rôles système (adhérent, coach, bureau)',
  })
  roles!: MemberClubRole[];

  @Field(() => [ClubRoleDefinitionGraph], {
    description: 'Rôles personnalisés définis pour le club',
  })
  customRoles!: ClubRoleDefinitionGraph[];

  @Field(() => MemberFamilySummaryGraph, { nullable: true })
  family!: MemberFamilySummaryGraph | null;

  @Field(() => MemberFamilyLinkSummaryGraph, { nullable: true })
  familyLink!: MemberFamilyLinkSummaryGraph | null;

  @Field(() => [MemberCustomFieldValueGraph], {
    description: 'Valeurs des champs personnalisés (définitions non archivées)',
  })
  customFieldValues!: MemberCustomFieldValueGraph[];

  /** Renseigné côté service ; exposé au schéma via `MemberGraphResolver`. */
  assignedDynamicGroups!: AssignedDynamicGroupGraph[];
}
