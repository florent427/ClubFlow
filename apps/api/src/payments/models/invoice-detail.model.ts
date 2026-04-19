import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import {
  ClubPaymentMethod,
  InvoiceLineAdjustmentType,
  InvoiceLineKind,
  InvoiceStatus,
  SubscriptionBillingRhythm,
} from '@prisma/client';

@ObjectType()
export class InvoiceLineAdjustmentGraph {
  @Field(() => ID) id!: string;
  @Field(() => Int) stepOrder!: number;
  @Field(() => InvoiceLineAdjustmentType) type!: InvoiceLineAdjustmentType;
  @Field(() => Int) amountCents!: number;
  @Field(() => Int, { nullable: true }) percentAppliedBp!: number | null;
  @Field({ nullable: true }) reason!: string | null;
}

@ObjectType()
export class InvoiceLineGraph {
  @Field(() => ID) id!: string;
  @Field(() => InvoiceLineKind) kind!: InvoiceLineKind;
  @Field(() => ID) memberId!: string;
  @Field() memberFirstName!: string;
  @Field() memberLastName!: string;
  @Field(() => ID, { nullable: true }) membershipProductId!: string | null;
  @Field({ nullable: true }) membershipProductLabel!: string | null;
  @Field(() => ID, { nullable: true }) membershipOneTimeFeeId!: string | null;
  @Field({ nullable: true }) membershipOneTimeFeeLabel!: string | null;
  @Field(() => SubscriptionBillingRhythm, { nullable: true })
  subscriptionBillingRhythm!: SubscriptionBillingRhythm | null;
  @Field(() => Int) baseAmountCents!: number;
  @Field(() => [InvoiceLineAdjustmentGraph]) adjustments!: InvoiceLineAdjustmentGraph[];
}

@ObjectType()
export class InvoicePaymentGraph {
  @Field(() => ID) id!: string;
  @Field(() => Int) amountCents!: number;
  @Field(() => ClubPaymentMethod) method!: ClubPaymentMethod;
  @Field({ nullable: true }) externalRef!: string | null;
  @Field({ nullable: true }) paidByFirstName!: string | null;
  @Field({ nullable: true }) paidByLastName!: string | null;
  @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class InvoiceDetailGraph {
  @Field(() => ID) id!: string;
  @Field(() => ID) clubId!: string;
  @Field(() => ID, { nullable: true }) familyId!: string | null;
  @Field({ nullable: true }) familyLabel!: string | null;
  @Field(() => ID, { nullable: true }) clubSeasonId!: string | null;
  @Field({ nullable: true }) clubSeasonLabel!: string | null;
  @Field() label!: string;
  @Field(() => Int) baseAmountCents!: number;
  @Field(() => Int) amountCents!: number;
  @Field(() => Int) totalPaidCents!: number;
  @Field(() => Int) balanceCents!: number;
  @Field(() => InvoiceStatus) status!: InvoiceStatus;
  @Field(() => ClubPaymentMethod, { nullable: true })
  lockedPaymentMethod!: ClubPaymentMethod | null;
  @Field(() => Date, { nullable: true }) dueAt!: Date | null;
  @Field(() => Date) createdAt!: Date;
  @Field(() => [InvoiceLineGraph]) lines!: InvoiceLineGraph[];
  @Field(() => [InvoicePaymentGraph]) payments!: InvoicePaymentGraph[];
}
