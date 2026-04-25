import { Field, GraphQLISODateTime, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { MemberCivility, MembershipCartStatus, SubscriptionBillingRhythm } from '@prisma/client';

registerEnumType(MembershipCartStatus, {
  name: 'MembershipCartStatus',
});

/**
 * Inscription "en attente" : le Member n'est pas encore créé. Affiché
 * dans le cart au même titre que les `items`, avec un badge "à valider"
 * pour différenciation. Convertie en CartItem + Member réel à la
 * validation du cart.
 */
@ObjectType()
export class MembershipCartPendingItemGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  cartId!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String)
  lastName!: string;

  @Field(() => MemberCivility)
  civility!: MemberCivility;

  @Field(() => GraphQLISODateTime)
  birthDate!: Date;

  @Field(() => String)
  email!: string;

  /** IDs des formules sélectionnées (multi-formules). */
  @Field(() => [ID])
  membershipProductIds!: string[];

  /** Labels snapshot des formules pour affichage sans round-trip. */
  @Field(() => [String])
  membershipProductLabels!: string[];

  /** Total estimé (somme des annualAmountCents des formules choisies). */
  @Field(() => Int)
  estimatedTotalCents!: number;

  @Field(() => SubscriptionBillingRhythm)
  billingRhythm!: SubscriptionBillingRhythm;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;
}

@ObjectType()
export class MembershipCartItemGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  cartId!: string;

  @Field(() => ID)
  memberId!: string;

  @Field(() => String)
  memberFullName!: string;

  @Field(() => ID, { nullable: true })
  membershipProductId!: string | null;

  @Field(() => String, { nullable: true })
  membershipProductLabel!: string | null;

  @Field(() => SubscriptionBillingRhythm)
  billingRhythm!: SubscriptionBillingRhythm;

  @Field(() => Boolean)
  hasExistingLicense!: boolean;

  @Field(() => String, { nullable: true })
  existingLicenseNumber!: string | null;

  @Field(() => Int)
  exceptionalDiscountCents!: number;

  @Field(() => String, { nullable: true })
  exceptionalDiscountReason!: string | null;

  @Field(() => Boolean)
  requiresManualAssignment!: boolean;

  /** Total ligne après ajustements + frais uniques auto-applicables, en cents. */
  @Field(() => Int)
  lineTotalCents!: number;

  /** Base adhésion en cents (annuel ou mensuel). */
  @Field(() => Int)
  subscriptionBaseCents!: number;

  /** Total après prorata / famille / exceptionnelle. */
  @Field(() => Int)
  subscriptionAdjustedCents!: number;

  /** Somme des frais auto (licence, cotisation, etc.). */
  @Field(() => Int)
  oneTimeFeesCents!: number;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class MembershipCartGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field(() => ID)
  familyId!: string;

  @Field(() => ID)
  clubSeasonId!: string;

  @Field(() => String)
  clubSeasonLabel!: string;

  @Field(() => ID, { nullable: true })
  payerContactId!: string | null;

  @Field(() => ID, { nullable: true })
  payerMemberId!: string | null;

  @Field(() => String, { nullable: true })
  payerFullName!: string | null;

  @Field(() => MembershipCartStatus)
  status!: MembershipCartStatus;

  @Field(() => GraphQLISODateTime, { nullable: true })
  validatedAt!: Date | null;

  @Field(() => ID, { nullable: true })
  invoiceId!: string | null;

  @Field(() => String, { nullable: true })
  cancelledReason!: string | null;

  @Field(() => String, { nullable: true })
  notes!: string | null;

  @Field(() => [MembershipCartItemGraph])
  items!: MembershipCartItemGraph[];

  /** Inscriptions en attente (Member pas encore créé). */
  @Field(() => [MembershipCartPendingItemGraph])
  pendingItems!: MembershipCartPendingItemGraph[];

  @Field(() => Int)
  totalCents!: number;

  @Field(() => Int)
  requiresManualAssignmentCount!: number;

  @Field(() => Boolean)
  canValidate!: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}
