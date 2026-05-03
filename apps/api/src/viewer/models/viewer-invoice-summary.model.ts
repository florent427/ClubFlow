import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { InvoiceStatus } from '@prisma/client';
import { ViewerInvoicePaymentSnippetGraph } from './viewer-invoice-payment-snippet.model';

@ObjectType()
export class ViewerInvoiceSummaryGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID, {
    nullable: true,
    description:
      'Foyer responsable de la facture (permet au portail de regrouper par foyer dans un espace partagé).',
  })
  familyId?: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'Libellé lisible du foyer responsable (dérivé si le foyer n’a pas de label explicite).',
  })
  familyLabel?: string | null;

  @Field()
  label!: string;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field(() => Date, { nullable: true })
  dueAt!: Date | null;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => Int)
  totalPaidCents!: number;

  @Field(() => Int)
  balanceCents!: number;

  @Field(() => [ViewerInvoicePaymentSnippetGraph])
  payments!: ViewerInvoicePaymentSnippetGraph[];
}
