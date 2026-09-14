import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ShopOrderGraph } from '../../shop/models/shop-order.model';
import {
  ShopOrderCardRefundResultGraph,
  ShopOrderRefundActionGraph,
} from './shop-order-cancellation.model';

/** Ce que ferait l'ajustement d'une ligne, montré avant de confirmer (ADR-0020). */
@ObjectType()
export class ShopOrderLineAdjustmentPreviewGraph {
  /** Raisons de refuser. Vide : l'ajustement peut avoir lieu. */
  @Field(() => [String])
  blockers!: string[];

  @Field()
  delivered!: boolean;

  @Field()
  exited!: boolean;

  /** Échange d'une commande remise : l'adhérent signe ce qu'il reçoit. */
  @Field()
  signatureRequired!: boolean;

  @Field(() => Int)
  removedCents!: number;

  @Field(() => Int)
  addedCents!: number;

  /** Ajouté − retiré. */
  @Field(() => Int)
  differenceCents!: number;

  /** Unités qui attendaient l'arrivage : l'attente baisse. */
  @Field(() => Int)
  fromAwaiting!: number;

  /** Unités seulement réservées, libérées. */
  @Field(() => Int)
  releaseUnits!: number;

  /** Unités sorties du stock, qui reviennent au club. */
  @Field(() => Int)
  returnUnits!: number;

  @Field(() => String, { nullable: true })
  newItemLabel!: string | null;

  @Field(() => Int, { nullable: true })
  newItemUnitPriceCents!: number | null;

  /** Unités du nouvel article qui attendront l'arrivage. */
  @Field(() => Int, { nullable: true })
  newItemAwaitingUnits!: number | null;

  /** Facture du reste à payer, quand la différence est due. */
  @Field(() => Int)
  supplementCents!: number;

  @Field(() => [ShopOrderRefundActionGraph])
  refunds!: ShopOrderRefundActionGraph[];

  @Field(() => Int)
  refundCents!: number;

  /** Reste dû éteint par un avoir. */
  @Field(() => Int)
  writeOffCents!: number;

  /** Une facture du reste à payer, jamais réglée, est annulée. */
  @Field()
  invoiceVoided!: boolean;

  /** La commande en attente se retrouve entièrement réglée. */
  @Field()
  settlesOrder!: boolean;
}

@ObjectType()
export class ShopOrderLineAdjustmentResultGraph {
  @Field(() => ShopOrderGraph)
  order!: ShopOrderGraph;

  @Field(() => ID)
  adjustmentId!: string;

  @Field(() => [ShopOrderCardRefundResultGraph])
  cardRefunds!: ShopOrderCardRefundResultGraph[];

  /** Espèces, virements et chèques rendus, en centimes. */
  @Field(() => Int)
  manualRefundedCents!: number;

  @Field(() => Int)
  chequesReturned!: number;

  @Field(() => Int)
  writtenOffCents!: number;

  /** Facture du reste à payer émise, s'il y en a une. */
  @Field(() => ID, { nullable: true })
  supplementInvoiceId!: string | null;

  @Field(() => Int)
  supplementCents!: number;

  /** Échange signé : le bon d'échange est disponible. */
  @Field()
  signed!: boolean;
}
