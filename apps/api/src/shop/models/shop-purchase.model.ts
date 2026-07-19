import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  ShopPurchaseOrderStatus,
  ShopReceiptDiscrepancyReason,
} from '@prisma/client';

registerEnumType(ShopPurchaseOrderStatus, {
  name: 'ShopPurchaseOrderStatus',
  description:
    'Cycle de vie d’une commande fournisseur. CALCULÉ après chaque réception, jamais saisi (ADR-0013 §3).',
});

registerEnumType(ShopReceiptDiscrepancyReason, {
  name: 'ShopReceiptDiscrepancyReason',
  description:
    'Pourquoi le reçu diffère du commandé. BACKORDER laisse la ligne OUVERTE, tous les autres motifs la SOLDENT (ADR-0013 §2).',
});

@ObjectType()
export class ShopSupplierGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  contactName!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  /** Référence du club chez ce fournisseur (numéro de compte client). */
  @Field(() => String, { nullable: true })
  accountRef!: string | null;

  /** Délai de livraison habituel, en jours. Sert à dater l'arrivée attendue. */
  @Field(() => Int, { nullable: true })
  leadTimeDays!: number | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  /**
   * Faux tient lieu de suppression : `ShopPurchaseOrder.supplier` porte un
   * `onDelete: Restrict`, un fournisseur déjà commandé ne peut pas disparaître.
   */
  @Field()
  active!: boolean;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class ShopPurchaseOrderLineGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  variantId!: string;

  @Field(() => Int)
  orderedQty!: number;

  /** Cumul des réceptions. Maintenu par le moteur, jamais saisi. */
  @Field(() => Int)
  receivedQty!: number;

  /** Prix d'achat unitaire HT, en CENTIMES. Reporting seulement (ADR-0013 §1). */
  @Field(() => Int)
  unitCostCents!: number;

  /**
   * Soldée : plus rien n'est attendu dessus, que la quantité soit atteinte ou
   * non. C'est le motif d'écart qui décide.
   */
  @Field()
  closed!: boolean;
}

@ObjectType()
export class ShopPurchaseReceptionLineGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  orderLineId!: string;

  @Field(() => Int)
  receivedQty!: number;

  @Field(() => ShopReceiptDiscrepancyReason, { nullable: true })
  discrepancyReason!: ShopReceiptDiscrepancyReason | null;

  @Field(() => String, { nullable: true })
  discrepancyNote!: string | null;

  /** Mouvement de stock engendré. C'est lui qui rend le journal précis. */
  @Field(() => ID, { nullable: true })
  movementId!: string | null;
}

@ObjectType()
export class ShopPurchaseReceptionGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  receivedAt!: Date;

  @Field(() => String, { nullable: true })
  deliveryNote!: string | null;

  @Field(() => ID, { nullable: true })
  userId!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [ShopPurchaseReceptionLineGraph])
  lines!: ShopPurchaseReceptionLineGraph[];
}

@ObjectType()
export class ShopPurchaseOrderGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  supplierId!: string;

  @Field(() => ShopSupplierGraph, { nullable: true })
  supplier!: ShopSupplierGraph | null;

  /** Référence lisible engendrée (« CF-2026-004 »), unique par club. */
  @Field()
  reference!: string;

  @Field(() => ShopPurchaseOrderStatus)
  status!: ShopPurchaseOrderStatus;

  @Field(() => Date, { nullable: true })
  orderedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  expectedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  closedAt!: Date | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [ShopPurchaseOrderLineGraph])
  lines!: ShopPurchaseOrderLineGraph[];

  /** Les livraisons, de la plus récente à la plus ancienne (ADR-0013 §5). */
  @Field(() => [ShopPurchaseReceptionGraph])
  receptions!: ShopPurchaseReceptionGraph[];

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
