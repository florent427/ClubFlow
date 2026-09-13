import { Field, ID, ObjectType } from '@nestjs/graphql';

/**
 * Conditions générales de vente de la boutique (ADR-0017), identiques pour
 * l'admin et pour l'adhérent.
 */
@ObjectType()
export class ShopTermsGraph {
  /**
   * Identifiant du PDF. L'adhérent le renvoie en commandant : c'est ainsi que
   * le serveur vérifie qu'il a accepté la version EN VIGUEUR, et pas une
   * version remplacée pendant qu'il réglait.
   */
  @Field(() => ID)
  id!: string;

  @Field()
  fileName!: string;

  /** Lien public : les CGV se lisent sans être connecté. */
  @Field()
  url!: string;

  /** Mise en ligne de cette version. */
  @Field(() => Date, { nullable: true })
  updatedAt!: Date | null;
}
