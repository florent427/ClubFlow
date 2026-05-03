import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ViewerFamilyMemberSnippetGraph } from './viewer-family-member-snippet.model';
import { ViewerInvoiceSummaryGraph } from './viewer-invoice-summary.model';
import { ViewerLinkedHouseholdFamilyGraph } from './viewer-linked-household-family.model';

@ObjectType()
export class ViewerFamilyBillingSummaryGraph {
  @Field(() => ID, {
    nullable: true,
    description:
      "Identifiant du foyer (utile pour distinguer plusieurs foyers renvoyés par viewerAllFamilyBillingSummaries). Null si aucun foyer n'est rattaché au profil actif.",
  })
  familyId?: string | null;

  @Field(() => ID, {
    nullable: true,
    description:
      "Identifiant du groupe foyer étendu quand plusieurs résidences sont regroupées côté club.",
  })
  householdGroupId?: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'Rôle du profil actif dans CE foyer : PAYER, COPAYER, VIEWER ou null si non rattaché.',
  })
  viewerRoleInFamily?: string | null;

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
