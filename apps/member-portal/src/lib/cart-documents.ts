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
      billingRhythm
      createdAt
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
  estimatedTotalCents: number;
  billingRhythm: 'ANNUAL' | 'MONTHLY';
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
};

export type ViewerActiveCartData = {
  viewerActiveMembershipCart: Cart | null;
};

export type ViewerCartsData = {
  viewerMembershipCarts: Cart[];
};
