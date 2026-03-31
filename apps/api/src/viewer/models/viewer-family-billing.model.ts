import { Field, ObjectType } from '@nestjs/graphql';
import { ViewerFamilyMemberSnippetGraph } from './viewer-family-member-snippet.model';
import { ViewerInvoiceSummaryGraph } from './viewer-invoice-summary.model';

@ObjectType()
export class ViewerFamilyBillingSummaryGraph {
  @Field({
    description:
      'true si le profil actif est payeur du foyer (accès factures agrégées).',
  })
  isPayerView!: boolean;

  @Field(() => String, { nullable: true })
  familyLabel!: string | null;

  @Field(() => [ViewerInvoiceSummaryGraph])
  invoices!: ViewerInvoiceSummaryGraph[];

  @Field(() => [ViewerFamilyMemberSnippetGraph])
  familyMembers!: ViewerFamilyMemberSnippetGraph[];
}
