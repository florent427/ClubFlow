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
export class AccountingExtractionGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  extractedVendor!: string | null;

  @Field(() => String, { nullable: true })
  extractedInvoiceNumber!: string | null;

  @Field(() => Int, { nullable: true })
  extractedTotalCents!: number | null;

  @Field(() => Int, { nullable: true })
  extractedVatCents!: number | null;

  @Field(() => Date, { nullable: true })
  extractedDate!: Date | null;

  @Field(() => String, { nullable: true })
  extractedAccountCode!: string | null;

  /** JSON stringifié — `{ vendor: 0.95, ... }`. Le client parse. */
  @Field(() => String, { nullable: true })
  confidencePerFieldJson!: string | null;

  /**
   * JSON stringifié de la décision IA finale (sortie du comparateur) :
   * `{ globalConfidencePct, globalReasoning, agreement, lines: [...] }`.
   * Null si le pipeline a totalement échoué.
   */
  @Field(() => String, { nullable: true })
  categorizationJson!: string | null;

  @Field(() => String, { nullable: true })
  model!: string | null;

  @Field(() => String, { nullable: true })
  error!: string | null;
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

  /**
   * Mode de paiement (compta analytique). String libre côté DB, mais en
   * pratique : "CASH", "CHECK", "TRANSFER", "CARD", "DIRECT_DEBIT",
   * "OTHER" ou null. Détecté par l'IA OCR ou saisi manuellement.
   */
  @Field(() => String, { nullable: true })
  paymentMethod!: string | null;

  /** N° chèque, n° d'opération virement, etc. — null si non applicable. */
  @Field(() => String, { nullable: true })
  paymentReference!: string | null;

  /**
   * Timestamp de démarrage de l'analyse IA OCR. Présent = pipeline IA
   * en cours d'exécution en arrière-plan ; null = pipeline terminé OU
   * écriture saisie manuellement. Le client affiche un badge "Analyse
   * en cours" tant que c'est non null.
   */
  @Field(() => Date, { nullable: true })
  aiProcessingStartedAt!: Date | null;

  /** Numéro de facture (séparé du label, utilisé pour le check antidoublon). */
  @Field(() => String, { nullable: true })
  invoiceNumber!: string | null;

  /**
   * Si non null, cette écriture est en collision (n° facture + montant)
   * avec l'entry pointée. L'UI affiche un bandeau d'avertissement avec
   * lien vers l'entry "originale".
   */
  @Field(() => ID, { nullable: true })
  duplicateOfEntryId!: string | null;

  @Field()
  occurredAt!: Date;

  @Field()
  createdAt!: Date;

  @Field(() => [AccountingEntryLineGraph])
  lines!: AccountingEntryLineGraph[];

  @Field(() => [AccountingDocumentGraph])
  documents!: AccountingDocumentGraph[];

  /**
   * Extraction IA associée (présente si l'écriture est issue de l'OCR
   * receipt scanner). Null pour les écritures saisies manuellement.
   */
  @Field(() => AccountingExtractionGraph, { nullable: true })
  extraction!: AccountingExtractionGraph | null;
}
