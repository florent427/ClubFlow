import { Field, ID, ObjectType } from '@nestjs/graphql';
import { FamilyMemberLinkRole } from '@prisma/client';

@ObjectType()
export class FamilyMemberLinkGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Présent pour les liens adhérents (`MEMBER` ou payeur membre).',
  })
  memberId!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Présent si le payeur est un contact sans fiche adhérent.',
  })
  contactId!: string | null;

  @Field(() => FamilyMemberLinkRole)
  linkRole!: FamilyMemberLinkRole;
}

@ObjectType()
export class FamilyGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => ID, {
    nullable: true,
    description: 'Groupe foyer étendu (parents séparés, facturation commune).',
  })
  householdGroupId!: string | null;

  @Field(() => Boolean, {
    description:
      'Vrai si le foyer a au moins un membre lié mais aucun payeur désigné',
  })
  needsPayer!: boolean;

  @Field(() => [FamilyMemberLinkGraph])
  links!: FamilyMemberLinkGraph[];
}
