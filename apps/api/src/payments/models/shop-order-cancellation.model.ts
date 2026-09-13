import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ShopOrderGraph } from '../../shop/models/shop-order.model';
import { ShopOrderRefundKind } from '../shop-order-refund-plan';

registerEnumType(ShopOrderRefundKind, {
  name: 'ShopOrderRefundKind',
  description:
    'Comment un encaissement est rendu à l’annulation d’une commande boutique (ADR-0019).',
});

@ObjectType()
export class ShopOrderRefundActionGraph {
  @Field(() => ShopOrderRefundKind)
  kind!: ShopOrderRefundKind;

  @Field(() => ID)
  paymentId!: string;

  /** Ce qui reste à rendre sur cet encaissement. */
  @Field(() => Int)
  amountCents!: number;

  @Field(() => String, { nullable: true })
  chequeNumber!: string | null;
}

@ObjectType()
export class ShopOrderCancellationLineGraph {
  @Field(() => ID)
  lineId!: string;

  @Field()
  label!: string;

  /** Unités sorties du stock, qui reviennent au club. */
  @Field(() => Int)
  returnUnits!: number;

  /** Unités seulement réservées, libérées. */
  @Field(() => Int)
  releaseUnits!: number;

  /** Unités en attente d'arrivage : l'attente s'éteint. */
  @Field(() => Int)
  awaitingUnits!: number;
}

/** Ce que ferait l'annulation, montré à l'admin avant qu'il confirme. */
@ObjectType()
export class ShopOrderCancellationPreviewGraph {
  /** Raisons de refuser l'annulation. Vide : elle peut avoir lieu. */
  @Field(() => [String])
  blockers!: string[];

  /** Commande remise : l'adhérent doit rapporter les articles. */
  @Field()
  delivered!: boolean;

  /** Marchandise sortie du stock : elle revient, remise en vente ou perdue. */
  @Field()
  exited!: boolean;

  @Field(() => [ShopOrderRefundActionGraph])
  refunds!: ShopOrderRefundActionGraph[];

  /** Reste dû jamais encaissé, éteint par un avoir d'annulation. */
  @Field(() => Int)
  writeOffCents!: number;

  /** Facture sans aucun encaissement : simplement annulée. */
  @Field()
  voidInvoice!: boolean;

  @Field(() => [ShopOrderCancellationLineGraph])
  lines!: ShopOrderCancellationLineGraph[];
}

@ObjectType()
export class ShopOrderCardRefundResultGraph {
  @Field(() => ID)
  paymentId!: string;

  @Field(() => Int)
  amountCents!: number;

  /** Faux : Stripe a refusé, le remboursement se relance depuis la facture. */
  @Field()
  ok!: boolean;

  @Field(() => String, { nullable: true })
  error!: string | null;
}

@ObjectType()
export class ShopOrderCancellationResultGraph {
  @Field(() => ShopOrderGraph)
  order!: ShopOrderGraph;

  @Field(() => [ShopOrderCardRefundResultGraph])
  cardRefunds!: ShopOrderCardRefundResultGraph[];

  /** Espèces, virements et chèques rendus, en centimes. */
  @Field(() => Int)
  manualRefundedCents!: number;

  @Field(() => Int)
  chequesReturned!: number;

  @Field(() => Int)
  writtenOffCents!: number;

  @Field()
  invoiceVoided!: boolean;
}
