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
}
