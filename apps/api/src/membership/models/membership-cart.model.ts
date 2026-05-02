import { Field, GraphQLISODateTime, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { MemberCivility, MembershipCartStatus, SubscriptionBillingRhythm } from '@prisma/client';

registerEnumType(MembershipCartStatus, {
  name: 'MembershipCartStatus',
});

/**
 * Aperçu d'une remise pricing-rule qui sera appliquée à la validation.
 * Non engageant : reflète l'état actuel des règles. Les valeurs
 * définitives sont calculées et persistées en `InvoiceLineAdjustment`
 * à la validation du cart.
 */
@ObjectType()
export class PricingRulePreviewGraph {
  @Field(() => String)
  ruleLabel!: string;

  @Field(() => Int)
  deltaAmountCents!: number;

  @Field(() => String)
  reason!: string;
}

/**
 * Détail d'une formule au sein d'une inscription en attente. Permet à
 * l'UI d'afficher la ventilation par formule (« Cotisation Karaté :
 * 360 € », « Cotisation Cross Training : 690 € »…) avec les remises
 * pricing-rule éventuellement appliquées sur chaque ligne.
 */
@ObjectType()
export class MembershipCartPendingPerProductGraph {
  @Field(() => ID)
  productId!: string;

  @Field(() => String)
  productLabel!: string;

  /** Tarif de base catalogue (annuel ou mensuel selon billingRhythm). */
  @Field(() => Int)
  subscriptionBaseCents!: number;

  /**
   * Tarif après ajustements légacy (prorata + remise famille hard-codée
   * + remise exceptionnelle). N'inclut PAS les remises pricing-rule —
   * celles-ci sont sur le champ `pricingRulesDeltaCents` ci-dessous.
   */
  @Field(() => Int)
  subscriptionAdjustedCents!: number;

  /**
   * Somme des deltas pricing-rule (config Settings → Adhésion) qui
   * s'appliquent à cette formule. Toujours négatif pour une remise.
   */
  @Field(() => Int)
  pricingRulesDeltaCents!: number;
}

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

  /**
   * Total **définitif** : montant que la facture portera pour ce
   * pending au moment de la validation (prorata + remises famille +
   * remises pricing-rules + frais auto déjà appliqués).
   */
  @Field(() => Int)
  estimatedTotalCents!: number;

  /**
   * Somme des cotisations ajustées (tarif après prorata + remise
   * famille hard-codée + remise exceptionnelle), avant pricing-rules.
   * Sert à afficher la ventilation détaillée dans le panier.
   */
  @Field(() => Int)
  subscriptionAdjustedCents!: number;

  /** Frais uniques auto-applicables (licence fédérale, etc.). */
  @Field(() => Int)
  oneTimeFeesCents!: number;

  /**
   * Détail par formule sélectionnée (1 entrée par membershipProductId).
   * Permet à l'UI panier de lister chaque cotisation séparément.
   */
  @Field(() => [MembershipCartPendingPerProductGraph])
  perProduct!: MembershipCartPendingPerProductGraph[];

  @Field(() => SubscriptionBillingRhythm)
  billingRhythm!: SubscriptionBillingRhythm;

  /**
   * Aperçu des remises pricing-rule qui s'appliqueront sur ce pending
   * (ex "🎁 Famille progressive : -10 € — 3ᵉ adhérent du foyer"). Le
   * montant `estimatedTotalCents` les inclut déjà ; ce champ est
   * informatif (pour expliquer le prix à l'utilisateur).
   */
  @Field(() => [PricingRulePreviewGraph])
  pricingRulePreviews!: PricingRulePreviewGraph[];

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

  /**
   * Aperçu des remises pricing-rule qui s'appliqueront à la validation
   * du projet. Permet à l'utilisateur de comprendre le détail du prix
   * (ex "🎁 Famille progressive : -10€ — 3ᵉ adhérent du foyer").
   */
  @Field(() => [PricingRulePreviewGraph])
  pricingRulePreviews!: PricingRulePreviewGraph[];

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

  /**
   * Total estimé du panier (sum des items après pricing rules dynamiques).
   * Avant validation : c'est l'estimation. Après validation : c'est ce qui
   * a été calculé au moment du `validateCart`. Ne reflète PAS forcément ce
   * qui sera vraiment encaissé — pour ça utiliser `invoiceAmountCents`.
   */
  @Field(() => Int)
  totalCents!: number;

  /**
   * Montant TTC de la facture liée (si le panier a été validé). C'est LE
   * montant qui sera réellement à payer = celui qui apparaît côté Facturation.
   * Peut différer de `totalCents` à cause de remises famille/groupe
   * appliquées au moment de l'émission de la facture, ou de frais one-time
   * ajoutés au panier mais non répercutés sur la facture.
   * Null tant que le panier n'a pas été validé / pas de facture liée.
   */
  @Field(() => Int, { nullable: true })
  invoiceAmountCents!: number | null;

  @Field(() => Int)
  requiresManualAssignmentCount!: number;

  @Field(() => Boolean)
  canValidate!: boolean;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}
