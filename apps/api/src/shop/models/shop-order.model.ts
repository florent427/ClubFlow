import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ShopOrderStatus } from '@prisma/client';

@ObjectType()
export class ShopOrderLineGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  orderId!: string;

  @Field(() => ID)
  productId!: string;

  /**
   * Déclinaison vendue. Null sur les lignes antérieures à l'ADR-0012 : elles
   * restent affichables, leur `label` ayant figé le libellé à la commande.
   */
  @Field(() => ID, { nullable: true })
  variantId!: string | null;

  @Field(() => Int)
  quantity!: number;

  @Field(() => Int)
  unitPriceCents!: number;

  @Field()
  label!: string;
}

@ObjectType()
export class ShopOrderGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field(() => ShopOrderStatus)
  status!: ShopOrderStatus;

  @Field(() => Int)
  totalCents!: number;

  @Field(() => String, { nullable: true })
  note!: string | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  paidAt!: Date | null;

  /**
   * Vrai si la commande porte une facture OUVERTE, donc payable en ligne
   * (bouton « Payer » / reprise de paiement). Faux pour une commande « réglée
   * sur place » (sans facture) : les écrans ne doivent y proposer qu'« Annuler ».
   */
  @Field()
  payableOnline!: boolean;

  @Field(() => [ShopOrderLineGraph])
  lines!: ShopOrderLineGraph[];

  @Field(() => String, { nullable: true })
  buyerFirstName!: string | null;

  @Field(() => String, { nullable: true })
  buyerLastName!: string | null;
}
