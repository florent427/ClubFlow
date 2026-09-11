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
