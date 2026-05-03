import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { FamilyInviteRole } from '@prisma/client';
import { ViewerFamilyMemberSnippetGraph } from './viewer-family-member-snippet.model';

registerEnumType(FamilyInviteRole, {
  name: 'FamilyInviteRole',
  description:
    "Rôle attribué à l'invitée lors de l'acceptation : COPAYER (paye pour sa résidence, accès partagé) ou VIEWER (observation en lecture).",
});

/**
 * Identité lisible d'un adulte payeur/observateur rattaché à un foyer-
 * résidence d'un groupe foyer étendu.
 */
@ObjectType()
export class ViewerHouseholdPersonGraph {
  @Field()
  firstName!: string;

  @Field()
  lastName!: string;
}

/**
 * Personne invitée dans un foyer : porte la même identité qu'un payeur
 * plus le rôle de l'invitation qui lui a donné l'accès (COPAYER ou VIEWER).
 */
@ObjectType()
export class ViewerHouseholdObserverGraph {
  @Field()
  firstName!: string;

  @Field()
  lastName!: string;

  @Field(() => FamilyInviteRole)
  role!: FamilyInviteRole;
}

/** Un foyer résidence rattaché au même groupe foyer étendu. */
@ObjectType()
export class ViewerLinkedHouseholdFamilyGraph {
  @Field(() => ID)
  familyId!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => [ViewerFamilyMemberSnippetGraph])
  members!: ViewerFamilyMemberSnippetGraph[];

  @Field(() => [ViewerHouseholdPersonGraph], {
    description:
      'Payeur(s) du foyer : adultes responsables de la facturation (FamilyMember.linkRole = PAYER).',
  })
  payers!: ViewerHouseholdPersonGraph[];

  @Field(() => [ViewerHouseholdObserverGraph], {
    description:
      'Invités à rejoindre ce foyer : co-payeurs (COPAYER) ou observateurs en lecture (VIEWER). Le rôle est porté sur chaque entrée pour que le client puisse les regrouper par libellé approprié.',
  })
  observers!: ViewerHouseholdObserverGraph[];
}
