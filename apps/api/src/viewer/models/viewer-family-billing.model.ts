import { Field, ObjectType } from '@nestjs/graphql';
import { ViewerFamilyMemberSnippetGraph } from './viewer-family-member-snippet.model';
import { ViewerInvoiceSummaryGraph } from './viewer-invoice-summary.model';
import { ViewerLinkedHouseholdFamilyGraph } from './viewer-linked-household-family.model';

@ObjectType()
export class ViewerFamilyBillingSummaryGraph {
  @Field(() => Boolean, {
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

  @Field(() => Boolean, {
    description:
      'true si la facturation et la liste des membres couvrent un groupe foyer étendu (plusieurs résidences).',
  })
  isHouseholdGroupSpace!: boolean;

  @Field(() => [ViewerLinkedHouseholdFamilyGraph], {
    description:
      'Foyers résidences du groupe : partage facturation côté club ; documents / messages intra-familiaux prévus.',
  })
  linkedHouseholdFamilies!: ViewerLinkedHouseholdFamilyGraph[];
}
