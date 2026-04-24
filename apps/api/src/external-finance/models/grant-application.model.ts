import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { GrantApplicationStatus, GrantDocumentKind } from '@prisma/client';

@ObjectType()
export class GrantInstallmentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  expectedAmountCents!: number;

  @Field(() => Int, { nullable: true })
  receivedAmountCents!: number | null;

  @Field(() => Date, { nullable: true })
  expectedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  receivedAt!: Date | null;

  @Field(() => ID, { nullable: true })
  paymentId!: string | null;

  @Field(() => ID, { nullable: true })
  accountingEntryId!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class GrantDocumentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  mediaAssetId!: string;

  @Field(() => GrantDocumentKind)
  kind!: GrantDocumentKind;

  @Field()
  fileName!: string;

  @Field()
  publicUrl!: string;

  @Field()
  mimeType!: string;
}

@ObjectType()
export class GrantApplicationGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  fundingBody!: string | null;

  @Field(() => GrantApplicationStatus)
  status!: GrantApplicationStatus;

  @Field(() => Int, { nullable: true })
  requestedAmountCents!: number | null;

  @Field(() => Int, { nullable: true })
  grantedAmountCents!: number | null;

  /** Legacy field conservé pour compat UI. */
  @Field(() => Int, { nullable: true })
  amountCents!: number | null;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => String, { nullable: true })
  projectTitle!: string | null;

  @Field(() => Date, { nullable: true })
  startsAt!: Date | null;

  @Field(() => Date, { nullable: true })
  endsAt!: Date | null;

  @Field(() => Date, { nullable: true })
  reportDueAt!: Date | null;

  @Field(() => Date, { nullable: true })
  reportSubmittedAt!: Date | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [GrantInstallmentGraph])
  installments!: GrantInstallmentGraph[];

  @Field(() => [GrantDocumentGraph])
  documents!: GrantDocumentGraph[];

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
