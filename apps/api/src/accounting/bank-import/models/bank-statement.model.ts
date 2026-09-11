import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  AccountingEntryKind,
  AccountingEntrySource,
  BankMatchOrigin,
  BankStatementFormat,
  BankStatementLineIgnoreReason,
  BankStatementLineStatus,
  BankStatementStatus,
  CategorizationDirection,
  CategorizationMatchKind,
  CategorizationRuleSource,
} from '@prisma/client';
import { SignedPhotoField } from '../../../media/signed-photo-field.decorator';

registerEnumType(BankStatementFormat, { name: 'BankStatementFormat' });
registerEnumType(BankStatementStatus, {
  name: 'BankStatementStatus',
  description:
    'PARSING → NEEDS_CHECK (intégrité KO ou chaînage inconnu) → READY (exploitable) → RECONCILED (tout rapproché ou ignoré). FAILED = lecture impossible.',
});
registerEnumType(BankStatementLineStatus, { name: 'BankStatementLineStatus' });
registerEnumType(BankStatementLineIgnoreReason, {
  name: 'BankStatementLineIgnoreReason',
});
registerEnumType(BankMatchOrigin, { name: 'BankMatchOrigin' });

@ObjectType()
export class BankLineMatchGraph {
  @Field(() => ID)
  entryId!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => BankMatchOrigin)
  origin!: BankMatchOrigin;

  @Field()
  entryLabel!: string;

  @Field(() => GraphQLISODateTime)
  entryOccurredAt!: Date;

  @Field(() => AccountingEntryKind)
  entryKind!: AccountingEntryKind;

  @Field(() => AccountingEntrySource)
  entrySource!: AccountingEntrySource;

  @Field(() => Int)
  entryAmountCents!: number;
}

/** Ligne de relevé. `amountCents` signé : positif = crédit pour le club. */
registerEnumType(CategorizationMatchKind, { name: 'CategorizationMatchKind' });
registerEnumType(CategorizationDirection, {
  name: 'CategorizationDirection',
  description: 'Sens auquel une règle s’applique : une règle « EDF » en dépense n’attrape pas un remboursement.',
});
registerEnumType(CategorizationRuleSource, { name: 'CategorizationRuleSource' });

/** Proposition de compte pour une ligne sans écriture (ADR-0014 §5). */
@ObjectType()
export class BankLineProposalGraph {
  @Field()
  accountCode!: string;

  @Field()
  accountLabel!: string;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => String, { nullable: true })
  projectTitle!: string | null;

  /** Libellé d'écriture proposé, débarrassé du bruit bancaire. */
  @Field()
  label!: string;

  @Field(() => Int)
  confidencePct!: number;

  /** RULE (une règle du club a décidé) ou AI. */
  @Field()
  source!: string;

  @Field(() => ID, { nullable: true })
  ruleId!: string | null;

  @Field(() => String, { nullable: true })
  reasoning!: string | null;

  @Field(() => [String])
  models!: string[];

  /** Validable en lot : règle, ou deux modèles d'accord et sûrs. */
  @Field()
  clear!: boolean;
}

/** Un tour de l'échange entre l'IA et le trésorier sur une ligne. */
@ObjectType()
export class BankLineTurnGraph {
  @Field()
  role!: string;

  @Field()
  text!: string;
}

/** Règle de catégorisation du club. */
@ObjectType()
export class CategorizationRuleGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  pattern!: string;

  @Field(() => CategorizationMatchKind)
  matchKind!: CategorizationMatchKind;

  @Field(() => CategorizationDirection)
  direction!: CategorizationDirection;

  @Field()
  accountCode!: string;

  @Field(() => String, { nullable: true })
  accountLabel!: string | null;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => String, { nullable: true })
  label!: string | null;

  @Field(() => CategorizationRuleSource)
  source!: CategorizationRuleSource;

  @Field(() => Int)
  hitCount!: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastHitAt!: Date | null;

  @Field()
  isActive!: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

/** Une ligne telle qu'un des deux modèles l'a lue (relevé PDF). */
@ObjectType()
export class BankLineReadingGraph {
  @Field()
  bookedOn!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;
}

/**
 * Désaccord entre les deux lectures d'une ligne (ADR-0014 §3) :
 * ONLY_IN_A / ONLY_IN_B (vue d'un seul côté), AMOUNT, DATE.
 */
@ObjectType()
export class BankLineDivergenceGraph {
  @Field()
  kind!: string;

  @Field(() => BankLineReadingGraph, { nullable: true })
  a!: BankLineReadingGraph | null;

  @Field(() => BankLineReadingGraph, { nullable: true })
  b!: BankLineReadingGraph | null;
}

@ObjectType()
export class BankStatementLineGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  lineIndex!: number;

  @Field()
  bookedOn!: string;

  @Field(() => String, { nullable: true })
  valueOn!: string | null;

  @Field()
  label!: string;

  @Field()
  rawLabel!: string;

  @Field(() => String, { nullable: true })
  reference!: string | null;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => Int, { nullable: true })
  balanceAfterCents!: number | null;

  @Field(() => BankStatementLineStatus)
  status!: BankStatementLineStatus;

  @Field(() => BankStatementLineIgnoreReason, { nullable: true })
  ignoreReason!: BankStatementLineIgnoreReason | null;

  @Field(() => String, { nullable: true })
  ignoreNote!: string | null;

  @Field(() => [ID])
  candidateEntryIds!: string[];

  @Field(() => [BankLineMatchGraph])
  matches!: BankLineMatchGraph[];

  @Field(() => GraphQLISODateTime, { nullable: true })
  resolvedAt!: Date | null;

  /** Faux tant qu'une divergence entre les deux lectures attend un humain. */
  @Field()
  readingAgreement!: boolean;

  @Field(() => BankLineDivergenceGraph, { nullable: true })
  divergence!: BankLineDivergenceGraph | null;

  /** Proposition de compte en attente de validation, s'il y en a une. */
  @Field(() => BankLineProposalGraph, { nullable: true })
  proposal!: BankLineProposalGraph | null;

  /** Écriture NEEDS_REVIEW portant la proposition. */
  @Field(() => ID, { nullable: true })
  proposedEntryId!: string | null;

  /** Question de l'IA en attente de réponse. */
  @Field(() => String, { nullable: true })
  question!: string | null;

  @Field(() => [BankLineTurnGraph])
  conversation!: BankLineTurnGraph[];

  @Field(() => Int)
  aiAttempts!: number;

  /** Plus de proposition attendue : à saisir ou rapprocher à la main. */
  @Field()
  aiExhausted!: boolean;

  /** Virement d'adhérent reconnu : payeur et factures proposés. */
  @Field(() => BankPayerCandidateGraph, { nullable: true })
  payerProposal!: BankPayerCandidateGraph | null;
}

@ObjectType()
export class BankStatementListItemGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  financialAccountId!: string;

  @Field()
  financialAccountLabel!: string;

  @Field(() => BankStatementFormat)
  format!: BankStatementFormat;

  @Field(() => BankStatementStatus)
  status!: BankStatementStatus;

  @Field()
  periodStart!: string;

  @Field()
  periodEnd!: string;

  @Field(() => Int)
  openingBalanceCents!: number;

  @Field(() => Int)
  closingBalanceCents!: number;

  @Field(() => Int)
  lineCount!: number;

  /** début + Σ − fin ; 0 = juste. */
  @Field(() => Int, { nullable: true })
  integrityDeltaCents!: number | null;

  @Field(() => Boolean, { nullable: true })
  chainOk!: boolean | null;

  @Field(() => Int, { nullable: true })
  chainExpectedCents!: number | null;

  @Field(() => ID, { nullable: true })
  previousStatementId!: string | null;

  @SignedPhotoField('Fichier d’origine archivé : URL signée, valable un temps limité.')
  fileUrl!: string | null;

  @Field(() => String, { nullable: true })
  fileName!: string | null;

  /** Avertissements de lecture (lignes écartées…), une par ligne. */
  @Field(() => String, { nullable: true })
  warnings!: string | null;

  @Field(() => Int)
  unmatchedCount!: number;

  @Field(() => Int)
  suggestedCount!: number;

  @Field(() => Int)
  matchedCount!: number;

  @Field(() => Int)
  ignoredCount!: number;

  /** Lignes où les deux lectures d'un PDF divergent encore. */
  @Field(() => Int)
  divergenceCount!: number;

  /** Lignes à traiter portant une proposition à valider. */
  @Field(() => Int)
  proposalCount!: number;

  /** Lignes dont l'IA attend une réponse. */
  @Field(() => Int)
  questionCount!: number;

  /** Lignes encore sans proposition ni question. */
  @Field(() => Int)
  toCategorizeCount!: number;

  @Field(() => String, { nullable: true })
  readingModelA!: string | null;

  @Field(() => String, { nullable: true })
  readingModelB!: string | null;

  /** Coût IA de la lecture, en centimes. */
  @Field(() => Int)
  aiCostCents!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType()
export class BankStatementGraph extends BankStatementListItemGraph {
  @Field(() => [BankStatementLineGraph])
  lines!: BankStatementLineGraph[];
}

@ObjectType()
export class BankLineCandidateGraph {
  @Field(() => ID)
  entryId!: string;

  @Field()
  label!: string;

  @Field(() => GraphQLISODateTime)
  occurredAt!: Date;

  @Field(() => AccountingEntryKind)
  kind!: AccountingEntryKind;

  @Field(() => AccountingEntrySource)
  source!: AccountingEntrySource;

  @Field(() => Int)
  amountCents!: number;

  /** Part de l'écriture pas encore couverte par une ligne de relevé. */
  @Field(() => Int)
  remainingCents!: number;

  /** Clé forte : virement Stripe, remise de chèques, référence commune. */
  @Field()
  strong!: boolean;
}

@ObjectType()
export class ReconciliationAccountSummaryGraph {
  @Field(() => ID)
  financialAccountId!: string;

  @Field()
  label!: string;

  @Field()
  accountingAccountCode!: string;

  @Field()
  openingBalanceSet!: boolean;

  @Field(() => Int)
  statementCount!: number;

  @Field(() => String, { nullable: true })
  lastPeriodEnd!: string | null;

  @Field(() => BankStatementStatus, { nullable: true })
  lastStatus!: BankStatementStatus | null;

  @Field(() => Int)
  linesToHandle!: number;

  @Field(() => Int)
  unreconciledEntries!: number;
}

@ObjectType()
export class CsvMappingGraph {
  @Field()
  delimiter!: string;

  @Field()
  hasHeader!: boolean;

  @Field(() => Int)
  dateCol!: number;

  @Field(() => Int)
  labelCol!: number;

  @Field(() => Int, { nullable: true })
  amountCol!: number | null;

  @Field(() => Int, { nullable: true })
  debitCol!: number | null;

  @Field(() => Int, { nullable: true })
  creditCol!: number | null;

  @Field(() => Int, { nullable: true })
  balanceCol!: number | null;

  @Field(() => Int, { nullable: true })
  valueDateCol!: number | null;

  @Field(() => Int, { nullable: true })
  referenceCol!: number | null;

  /** DMY, YMD ou MDY. */
  @Field()
  dateFormat!: string;

  /** « , » ou « . ». */
  @Field()
  decimalSeparator!: string;
}

@ObjectType()
export class CsvPreviewLineGraph {
  @Field()
  bookedOn!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => Int, { nullable: true })
  balanceAfterCents!: number | null;
}

@ObjectType()
export class CsvPreviewGraph {
  @Field()
  delimiter!: string;

  @Field()
  encoding!: string;

  @Field()
  hasHeader!: boolean;

  @Field(() => [String])
  headers!: string[];

  @Field(() => [[String]])
  sampleRows!: string[][];

  @Field(() => Int)
  rowCount!: number;

  @Field(() => CsvMappingGraph)
  mapping!: CsvMappingGraph;

  @Field(() => Int)
  parsedCount!: number;

  @Field(() => [CsvPreviewLineGraph])
  previewLines!: CsvPreviewLineGraph[];

  @Field(() => Int, { nullable: true })
  openingBalanceCents!: number | null;

  @Field(() => Int, { nullable: true })
  closingBalanceCents!: number | null;

  @Field(() => String, { nullable: true })
  periodStart!: string | null;

  @Field(() => String, { nullable: true })
  periodEnd!: string | null;

  @Field(() => [String])
  warnings!: string[];

  @Field(() => String, { nullable: true })
  error!: string | null;
}
/** Personne du club qui a pu émettre un virement. */
@ObjectType()
export class BankPayerGraph {
  /** MEMBER ou CONTACT. */
  @Field()
  kind!: string;

  @Field(() => ID)
  id!: string;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;
}

/** Facture ouverte qu'un virement pourrait solder. */
@ObjectType()
export class BankPayerInvoiceGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  label!: string;

  @Field(() => Int)
  amountCents!: number;

  /** Reste dû, avoirs et acomptes déduits. */
  @Field(() => Int)
  balanceCents!: number;

  @Field(() => String, { nullable: true })
  dueAt!: string | null;
}

@ObjectType()
export class BankTransferAllocationGraph {
  @Field(() => ID)
  invoiceId!: string;

  @Field(() => Int)
  amountCents!: number;
}

/**
 * Virement d'adhérent reconnu (ADR-0014 §7) : qui a payé, quelles factures
 * le montant solde, et à quel point c'est sûr.
 */
@ObjectType()
export class BankPayerCandidateGraph {
  @Field(() => BankPayerGraph)
  payer!: BankPayerGraph;

  /** 100 = nom et prénom reconnus, 70 = nom de famille seul. */
  @Field(() => Int)
  nameScore!: number;

  /** EXACT, SUM (deux factures), PARTIAL (acompte) ou NONE. */
  @Field()
  amountMatch!: string;

  /** Au-dessus de 80, proposable en un clic. */
  @Field(() => Int)
  confidence!: number;

  @Field(() => [BankPayerInvoiceGraph])
  invoices!: BankPayerInvoiceGraph[];

  @Field(() => [BankTransferAllocationGraph])
  allocations!: BankTransferAllocationGraph[];
}

/** Ce qu'un encaissement de virement a réellement produit. */
@ObjectType()
export class BankTransferResultGraph {
  @Field(() => Int)
  invoicesPaid!: number;

  @Field()
  lineMatched!: boolean;

  @Field(() => String, { nullable: true })
  stoppedBecause!: string | null;

  @Field(() => BankStatementGraph)
  statement!: BankStatementGraph;
}

