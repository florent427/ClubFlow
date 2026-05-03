import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/**
 * Vue portail d'une formule d'adhésion que le contact/payeur peut choisir.
 * Ne contient que les champs pertinents pour l'affichage côté espace membre.
 */
@ObjectType()
export class ViewerMembershipFormulaGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  annualAmountCents!: number;

  @Field(() => Int)
  monthlyAmountCents!: number;

  @Field(() => Int, { nullable: true })
  minAge!: number | null;

  @Field(() => Int, { nullable: true })
  maxAge!: number | null;

  @Field()
  allowProrata!: boolean;

  /**
   * `true` si cette formule a déjà été prise par la même identité dans
   * la saison active (Member existant, cart item, pending item, ou
   * facture validée). Permet à l'UI de griser les options et d'éviter
   * un doublon (ex : Sophie ne peut pas prendre Karaté deux fois). Si
   * aucune identité n'est fournie au query, ce flag est toujours
   * `false`.
   */
  @Field()
  alreadyTakenInSeason!: boolean;
}
