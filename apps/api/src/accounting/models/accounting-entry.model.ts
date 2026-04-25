import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  Gender,
} from '@prisma/client';

@ObjectType()
export class AccountingAllocationGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => String, { nullable: true })
  projectTitle!: string | null;

  @Field(() => String, { nullable: true })
  cohortCode!: string | null;

  @Field(() => Gender, { nullable: true })
  gender!: Gender | null;

  @Field(() => String, { nullable: true })
  disciplineCode!: string | null;

  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => String, { nullable: true })
  memberName!: string | null;

  @Field(() => [String])
  dynamicGroupLabels!: string[];

  @Field(() => [String])
  freeformTags!: string[];
}

@ObjectType()
export class AccountingEntryLineGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  accountCode!: string;

  @Field()
  accountLabel!: string;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => AccountingLineSide)
  side!: AccountingLineSide;

  @Field(() => Int)
  debitCents!: number;

  @Field(() => Int)
  creditCents!: number;

  @Field(() => Float, { nullable: true })
  vatRate!: number | null;

  @Field(() => Int, { nullable: true })
  vatAmountCents!: number | null;

  // --- Validation granulaire ---
  @Field(() => Date, { nullable: true })
  validatedAt!: Date | null;

  // --- Traçabilité IA ---
  @Field(() => String, { nullable: true })
  iaSuggestedAccountCode!: string | null;

  @Field(() => String, { nullable: true })
  iaReasoning!: string | null;

  @Field(() => Int, { nullable: true })
  iaConfidencePct!: number | null;

  /** Si la ligne résulte d'une consolidation, contient les labels des
   *  articles d'origine fusionnés. Vide = ligne non consolidée. */
  @Field(() => [String])
  mergedFromArticleLabels!: string[];

  @Field(() => [AccountingAllocationGraph])
  allocations!: AccountingAllocationGraph[];
}

@ObjectType()
export class AccountingDocumentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  mediaAssetId!: string;

  @Field()
  fileName!: string;

  @Field()
  publicUrl!: string;

  @Field()
  mimeType!: string;
}

@ObjectType()
export class AccountingEntryGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => AccountingEntryKind)
  kind!: AccountingEntryKind;

  @Field(() => AccountingEntryStatus)
  status!: AccountingEntryStatus;

  @Field(() => AccountingEntrySource)
  source!: AccountingEntrySource;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => Int, { nullable: true })
  vatTotalCents!: number | null;

  @Field(() => ID, { nullable: true })
  paymentId!: string | null;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => ID, { nullable: true })
  contraEntryId!: string | null;

  /** Compte financier de contrepartie (banque/caisse/transit Stripe). */
  @Field(() => ID, { nullable: true })
  financialAccountId!: string | null;

  /** Libellé snapshot du compte financier (ex "Caisse buvette"). */
  @Field(() => String, { nullable: true })
  financialAccountLabel!: string | null;

  /** Code PCG du compte financier (ex "530200"). */
  @Field(() => String, { nullable: true })
  financialAccountCode!: string | null;

  /** Date de consolidation des lignes. Null = écriture détaillée standard. */
  @Field(() => Date, { nullable: true })
  consolidatedAt!: Date | null;

  @Field()
  occurredAt!: Date;

  @Field()
  createdAt!: Date;

  @Field(() => [AccountingEntryLineGraph])
  lines!: AccountingEntryLineGraph[];

  @Field(() => [AccountingDocumentGraph])
  documents!: AccountingDocumentGraph[];
}
