import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  SponsorshipDealStatus,
  SponsorshipDocumentKind,
  SponsorshipKind,
} from '@prisma/client';

@ObjectType()
export class SponsorshipInstallmentGraph {
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

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class SponsorshipDocumentGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  mediaAssetId!: string;

  @Field(() => SponsorshipDocumentKind)
  kind!: SponsorshipDocumentKind;

  @Field()
  fileName!: string;

  @Field()
  publicUrl!: string;

  @Field()
  mimeType!: string;
}

@ObjectType()
export class SponsorshipDealGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  sponsorName!: string;

  @Field(() => SponsorshipKind)
  kind!: SponsorshipKind;

  @Field(() => SponsorshipDealStatus)
  status!: SponsorshipDealStatus;

  @Field(() => Int, { nullable: true })
  valueCents!: number | null;

  /** Legacy compat */
  @Field(() => Int, { nullable: true })
  amountCents!: number | null;

  @Field(() => String, { nullable: true })
  inKindDescription!: string | null;

  @Field(() => ID, { nullable: true })
  projectId!: string | null;

  @Field(() => String, { nullable: true })
  projectTitle!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field(() => String, { nullable: true })
  contactName!: string | null;

  @Field(() => Date, { nullable: true })
  startsAt!: Date | null;

  @Field(() => Date, { nullable: true })
  endsAt!: Date | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [SponsorshipInstallmentGraph])
  installments!: SponsorshipInstallmentGraph[];

  @Field(() => [SponsorshipDocumentGraph])
  documents!: SponsorshipDocumentGraph[];

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
