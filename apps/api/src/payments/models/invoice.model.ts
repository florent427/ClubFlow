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
    description:
      'Reste à payer : amountCents − totalPaidCents − creditNotesAppliedCents (plancher 0). Toujours 0 pour un avoir.',
  })
  balanceCents!: number;

  @Field(() => Int, {
    defaultValue: 0,
    description:
      "Somme des avoirs émis sur cette facture parente (réduit le balanceCents). Toujours 0 pour un avoir lui-même.",
  })
  creditNotesAppliedCents?: number;

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
