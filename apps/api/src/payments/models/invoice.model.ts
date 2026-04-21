import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { ClubPaymentMethod, InvoiceStatus } from '@prisma/client';

@ObjectType()
export class InvoiceGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID, { nullable: true })
  familyId!: string | null;

  @Field(() => ID, { nullable: true })
  householdGroupId!: string | null;

  @Field(() => ID, { nullable: true })
  clubSeasonId!: string | null;

  @Field()
  label!: string;

  @Field(() => Int)
  baseAmountCents!: number;

  @Field(() => Int)
  amountCents!: number;

  @Field(() => InvoiceStatus)
  status!: InvoiceStatus;

  @Field(() => ClubPaymentMethod, { nullable: true })
  lockedPaymentMethod!: ClubPaymentMethod | null;

  @Field(() => Date, { nullable: true })
  dueAt!: Date | null;

  @Field(() => String, { nullable: true })
  familyLabel!: string | null;

  @Field(() => String, { nullable: true })
  householdGroupLabel!: string | null;

  @Field(() => Int, {
    description:
      'Somme des encaissements enregistrés pour cette facture (tous modes).',
  })
  totalPaidCents!: number;

  @Field(() => Int, {
    description: 'Reste à payer : amountCents − totalPaidCents (plancher 0).',
  })
  balanceCents!: number;

  @Field(() => Boolean, {
    description: 'true si ce document est un avoir (credit note).',
  })
  isCreditNote!: boolean;

  @Field(() => ID, {
    nullable: true,
    description:
      "Facture source lorsque ce document est un avoir — sinon null.",
  })
  parentInvoiceId!: string | null;

  @Field(() => String, { nullable: true })
  creditNoteReason!: string | null;
}
