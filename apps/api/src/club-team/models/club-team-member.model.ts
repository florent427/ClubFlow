import { Field, ID, ObjectType } from '@nestjs/graphql';
import { MembershipRole } from '@prisma/client';

/**
 * Un accès back-office d'un club — une ligne `ClubMembership`.
 *
 * `isSelf` et `isLastAdmin` sont des INDICATIONS D'AFFICHAGE, pas des
 * garanties. Elles servent à désactiver un bouton et à écrire pourquoi ; le
 * refus réel est prononcé par le prédicat du `deleteMany` / `updateMany`
 * côté serveur, qui est le seul arbitre (cf. `ClubTeamService`). Un écran
 * périmé ne peut donc pas contourner la règle : il peut seulement échouer.
 */
@ObjectType()
export class ClubTeamMemberGraph {
  @Field(() => ID)
  membershipId!: string;

  @Field(() => ID)
  userId!: string;

  @Field()
  email!: string;

  @Field()
  displayName!: string;

  @Field(() => MembershipRole)
  role!: MembershipRole;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Boolean, {
    description: 'Cet accès est celui de la personne connectée.',
  })
  isSelf!: boolean;

  @Field(() => Boolean, {
    description:
      'Seul administrateur du club : ni retrait ni rétrogradation possibles. ' +
      'Indication d’affichage — le refus est prononcé par la base.',
  })
  isLastAdmin!: boolean;
}
