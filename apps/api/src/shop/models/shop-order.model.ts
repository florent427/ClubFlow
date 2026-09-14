import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  InvoiceStatus,
  ShopOrderAdjustmentKind,
  ShopOrderStatus,
} from '@prisma/client';

registerEnumType(ShopOrderAdjustmentKind, {
  name: 'ShopOrderAdjustmentKind',
  description:
    'Nature d’un ajustement de commande boutique : annulation d’articles, ou échange (ADR-0020).',
});

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

  /**
   * Unités en attente d'arrivage (ADR-0018) ; zéro quand tout est servi sur le
   * stock. C'est la commande de l'adhérent : il doit savoir ce qu'il peut
   * retirer au club et ce qui arrivera plus tard.
   */
  @Field(() => Int)
  awaitingStockQty!: number;

  /**
   * Unités retirées de la ligne — annulées ou échangées (ADR-0020). La
   * quantité active est `quantity − cancelledQty`.
   */
  @Field(() => Int)
  cancelledQty!: number;
}

/** Une annulation d'articles ou un échange, dans l'historique de la commande. */
@ObjectType()
export class ShopOrderAdjustmentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ShopOrderAdjustmentKind)
  kind!: ShopOrderAdjustmentKind;

  @Field()
  createdAt!: Date;

  /** Motif saisi par le club. Réservé à l'administration. */
  @Field(() => String, { nullable: true })
  reason!: string | null;

  @Field()
  returnedLabel!: string;

  @Field(() => Int)
  returnedQty!: number;

  /** Échange : l'article pris. Null pour une annulation. */
  @Field(() => String, { nullable: true })
  newLabel!: string | null;

  @Field(() => Int, { nullable: true })
  newQty!: number | null;

  /** Pris − rendu, en centimes. */
  @Field(() => Int)
  differenceCents!: number;

  /** Rendu à l'adhérent, tous moyens confondus (carte comprise). */
  @Field(() => Int)
  refundedCents!: number;

  /** Reste dû éteint par avoir. */
  @Field(() => Int)
  writtenOffCents!: number;

  /** Facture du reste à payer de l'échange, s'il y en a une. */
  @Field(() => ID, { nullable: true })
  supplementInvoiceId!: string | null;

  @Field(() => InvoiceStatus, { nullable: true })
  supplementInvoiceStatus!: InvoiceStatus | null;

  /** Échange d'une commande remise, signé : le bon d'échange existe. */
  @Field()
  signed!: boolean;
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

  @Field(() => Date, { nullable: true })
  cancelledAt!: Date | null;

  /**
   * Motif d'une annulation par le club (ADR-0019). Réservé à l'administration :
   * toujours null côté adhérent.
   */
  @Field(() => String, { nullable: true })
  cancelReason!: string | null;

  /**
   * Acceptation des CGV au passage de commande (ADR-0017). Null : aucune CGV
   * en vigueur à ce moment, ou vente au comptoir.
   */
  @Field(() => Date, { nullable: true })
  termsAcceptedAt!: Date | null;

  /**
   * Sortie de stock (ADR-0017). Null sur une commande payée avant le
   * 2026-09-13 : elle est sortie à son paiement.
   */
  @Field(() => Date, { nullable: true })
  fulfilledAt!: Date | null;

  /** Remise signée à l'adhérent (ADR-0017). */
  @Field(() => Date, { nullable: true })
  deliveredAt!: Date | null;

  /**
   * Personne qui a signé la remise. La signature elle-même n'est jamais
   * exposée ici : elle ne sort que dans le bon de livraison.
   */
  @Field(() => String, { nullable: true })
  deliverySignerName!: string | null;

  /**
   * Vrai s'il reste de l'argent dû sur la commande : « Payer » côté adhérent,
   * « Encaisser » côté club. Sa facture, ou celle du reste à payer d'un échange
   * (ADR-0020), avoirs déduits.
   */
  @Field()
  payableOnline!: boolean;

  /** Reste dû sur la commande, toutes factures confondues, avoirs déduits. */
  @Field(() => Int)
  amountDueCents!: number;

  /**
   * La facture de la commande, quel que soit son statut. C'est sur elle que le
   * club encaisse : l'écran l'ouvre directement au lieu de la chercher. Null
   * pour une commande antérieure à la facturation systématique.
   */
  @Field(() => ID, { nullable: true })
  invoiceId!: string | null;

  @Field(() => InvoiceStatus, { nullable: true })
  invoiceStatus!: InvoiceStatus | null;

  @Field(() => [ShopOrderLineGraph])
  lines!: ShopOrderLineGraph[];

  /**
   * Annulations d'articles et échanges (ADR-0020). Réservé à l'administration :
   * toujours vide côté adhérent.
   */
  @Field(() => [ShopOrderAdjustmentGraph])
  adjustments!: ShopOrderAdjustmentGraph[];

  @Field(() => String, { nullable: true })
  buyerFirstName!: string | null;

  @Field(() => String, { nullable: true })
  buyerLastName!: string | null;

  /**
   * Adresse de l'acheteur — sa fiche d'adhérent, ou le compte du contact.
   * Préremplit l'envoi du bon de livraison ; l'admin peut la remplacer.
   */
  @Field(() => String, { nullable: true })
  buyerEmail!: string | null;
}

/**
 * Ce que rend une vente au comptoir. La FACTURE est renvoyée autant que la
 * commande : c'est sur elle que le club enregistre le règlement, et sans son
 * identifiant l'écran devrait la retrouver à tâtons.
 */
@ObjectType()
export class ShopCounterSaleGraph {
  @Field(() => ID)
  orderId!: string;

  @Field(() => ID)
  invoiceId!: string;

  @Field(() => Int)
  totalCents!: number;
}
