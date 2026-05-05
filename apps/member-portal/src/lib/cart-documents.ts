import { gql } from '@apollo/client';

export const MEMBERSHIP_CART_FIELDS = gql`
  fragment MembershipCartFields on MembershipCartGraph {
    id
    clubId
    familyId
    clubSeasonId
    clubSeasonLabel
    payerFullName
    status
    validatedAt
    invoiceId
    cancelledReason
    totalCents
    requiresManualAssignmentCount
    canValidate
    items {
      id
      memberId
      memberFullName
      membershipProductId
      membershipProductLabel
      billingRhythm
      hasExistingLicense
      existingLicenseNumber
      exceptionalDiscountCents
      exceptionalDiscountReason
      requiresManualAssignment
      lineTotalCents
      subscriptionBaseCents
      subscriptionAdjustedCents
      oneTimeFeesCents
      oneTimeFeeOverrideIds
      pricingRulePreviews {
        ruleLabel
        deltaAmountCents
        reason
      }
    }
    pendingItems {
      id
      firstName
      lastName
      civility
      birthDate
      membershipProductIds
      membershipProductLabels
      estimatedTotalCents
      subscriptionAdjustedCents
      oneTimeFeesCents
      hasExistingLicense
      existingLicenseNumber
      oneTimeFeeOverrideIds
      billingRhythm
      perProduct {
        productId
        productLabel
        subscriptionBaseCents
        subscriptionAdjustedCents
        pricingRulesDeltaCents
      }
      pricingRulePreviews {
        ruleLabel
        deltaAmountCents
        reason
      }
      createdAt
    }
    clubOneTimeFees {
      id
      label
      amountCents
      kind
      autoApply
      licenseNumberPattern
      licenseNumberFormatHint
    }
  }
`;

export const VIEWER_ACTIVE_CART = gql`
  query ViewerActiveCart {
    viewerActiveMembershipCart {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_MEMBERSHIP_CARTS = gql`
  query ViewerMembershipCarts {
    viewerMembershipCarts {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_OPEN_CART = gql`
  mutation ViewerOpenMembershipCart {
    viewerOpenMembershipCart {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_UPDATE_CART_ITEM = gql`
  mutation ViewerUpdateCartItem($input: ViewerUpdateCartItemInput!) {
    viewerUpdateCartItem(input: $input) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_TOGGLE_CART_LICENSE = gql`
  mutation ViewerToggleCartItemLicense(
    $input: ViewerToggleCartItemLicenseInput!
  ) {
    viewerToggleCartItemLicense(input: $input) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_REMOVE_CART_ITEM = gql`
  mutation ViewerRemoveCartItem($itemId: String!) {
    viewerRemoveCartItem(itemId: $itemId) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_REMOVE_CART_PENDING_ITEM = gql`
  mutation ViewerRemoveCartPendingItem($pendingItemId: String!) {
    viewerRemoveCartPendingItem(pendingItemId: $pendingItemId) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_UPDATE_CART_PENDING_ITEM = gql`
  mutation ViewerUpdateCartPendingItem(
    $input: ViewerUpdateCartPendingItemInput!
  ) {
    viewerUpdateCartPendingItem(input: $input) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

/**
 * Toggle license existante sur INSCRIPTION EN ATTENTE (pending). Permet
 * au payeur de déclarer la licence AVANT validation du panier.
 * Validation regex serveur identique à celle des items.
 */
export const VIEWER_TOGGLE_PENDING_LICENSE = gql`
  mutation ViewerToggleCartPendingItemLicense(
    $input: ViewerToggleCartPendingItemLicenseInput!
  ) {
    viewerToggleCartPendingItemLicense(input: $input) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_VALIDATE_CART = gql`
  mutation ViewerValidateMembershipCart($cartId: String!) {
    viewerValidateMembershipCart(cartId: $cartId) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const VIEWER_REGISTER_SELF_AS_MEMBER = gql`
  mutation ViewerRegisterSelfAsMember($input: ViewerRegisterSelfAsMemberInput!) {
    viewerRegisterSelfAsMember(input: $input) {
      pendingItemId
      cartId
      firstName
      lastName
    }
  }
`;

export const VIEWER_REGISTER_CHILD_FOR_CART = gql`
  mutation ViewerRegisterChildForCart($input: ViewerRegisterChildMemberInput!) {
    viewerRegisterChildMember(input: $input) {
      pendingItemId
      cartId
      firstName
      lastName
    }
  }
`;

export type OneTimeFeeKind = 'LICENSE' | 'MANDATORY' | 'OPTIONAL';

export type ClubOneTimeFee = {
  id: string;
  label: string;
  amountCents: number;
  kind: OneTimeFeeKind;
  autoApply: boolean;
  licenseNumberPattern: string | null;
  licenseNumberFormatHint: string | null;
};

export type CartItem = {
  id: string;
  memberId: string;
  memberFullName: string;
  membershipProductId: string | null;
  membershipProductLabel: string | null;
  billingRhythm: 'ANNUAL' | 'MONTHLY';
  hasExistingLicense: boolean;
  existingLicenseNumber: string | null;
  exceptionalDiscountCents: number;
  exceptionalDiscountReason: string | null;
  requiresManualAssignment: boolean;
  lineTotalCents: number;
  subscriptionBaseCents: number;
  subscriptionAdjustedCents: number;
  oneTimeFeesCents: number;
  oneTimeFeeOverrideIds: string[] | null;
  /** Aperçu des remises pricing-rule (cf admin Settings) */
  pricingRulePreviews: Array<{
    ruleLabel: string;
    deltaAmountCents: number;
    reason: string;
  }>;
};

/**
 * Inscription en attente (Member pas encore créé). Affichée dans le
 * cart au même titre que les `items`, avec un badge "à valider".
 */
export type CartPendingItem = {
  id: string;
  firstName: string;
  lastName: string;
  civility: 'MR' | 'MME';
  birthDate: string;
  membershipProductIds: string[];
  membershipProductLabels: string[];
  /** Total final que portera la facture (toutes remises incluses). */
  estimatedTotalCents: number;
  /** Somme des cotisations ajustées (avant pricing-rules). */
  subscriptionAdjustedCents: number;
  /** Frais auto-applicables (licence, etc.). */
  oneTimeFeesCents: number;
  /** Le payeur a déclaré une licence existante pour cette inscription. */
  hasExistingLicense: boolean;
  existingLicenseNumber: string | null;
  /** OPTIONAL fees explicitement sélectionnés (null = autoApply normal). */
  oneTimeFeeOverrideIds: string[] | null;
  /** Détail par formule sélectionnée. */
  perProduct: Array<{
    productId: string;
    productLabel: string;
    subscriptionBaseCents: number;
    subscriptionAdjustedCents: number;
    pricingRulesDeltaCents: number;
  }>;
  billingRhythm: 'ANNUAL' | 'MONTHLY';
  pricingRulePreviews: Array<{
    ruleLabel: string;
    deltaAmountCents: number;
    reason: string;
  }>;
  createdAt: string;
};

export type Cart = {
  id: string;
  clubId: string;
  familyId: string;
  clubSeasonId: string;
  clubSeasonLabel: string;
  payerFullName: string | null;
  status: 'OPEN' | 'VALIDATED' | 'CANCELLED';
  validatedAt: string | null;
  invoiceId: string | null;
  cancelledReason: string | null;
  totalCents: number;
  requiresManualAssignmentCount: number;
  canValidate: boolean;
  items: CartItem[];
  pendingItems: CartPendingItem[];
  /** Catalogue complet des fees actifs du club (LICENSE/MANDATORY/OPTIONAL). */
  clubOneTimeFees: ClubOneTimeFee[];
};

export type ViewerActiveCartData = {
  viewerActiveMembershipCart: Cart | null;
};

export type ViewerCartsData = {
  viewerMembershipCarts: Cart[];
};
