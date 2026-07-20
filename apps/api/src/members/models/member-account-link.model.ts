import { Field, ID, ObjectType } from '@nestjs/graphql';

/** État courant du rattachement d'une fiche membre à un compte `User`. */
@ObjectType()
export class MemberAccountLinkStateGraph {
  @Field(() => ID)
  memberId!: string;

  @Field(() => ID, { nullable: true })
  userId!: string | null;

  @Field(() => String, { nullable: true })
  userEmail!: string | null;

  @Field(() => String, { nullable: true })
  userDisplayName!: string | null;
}

/**
 * Compte candidat au rattachement, AVEC son détenteur actuel.
 *
 * `heldByMemberId` est ce qui permet à l'écran d'avertir AVANT d'agir : sans
 * lui, l'admin découvrirait le déplacement après coup — c'est exactement le
 * scénario de l'incident de production.
 */
@ObjectType()
export class MemberAccountCandidateGraph {
  @Field(() => ID)
  userId!: string;

  @Field()
  email!: string;

  @Field()
  displayName!: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Fiche du club qui détient DÉJÀ ce compte, s’il y en a une.',
  })
  heldByMemberId!: string | null;

  @Field(() => String, { nullable: true })
  heldByMemberName!: string | null;

  @Field(() => Boolean, {
    description: 'True si l’e-mail du compte est identique à celui de la fiche.',
  })
  emailMatchesMember!: boolean;
}
