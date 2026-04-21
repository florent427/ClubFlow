import { gql } from '@apollo/client';

export const MEMBERSHIP_CART_FIELDS = gql`
  fragment AdminMembershipCartFields on MembershipCartGraph {
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
    }
  }
`;

export const CLUB_MEMBERSHIP_CARTS = gql`
  query ClubMembershipCarts($filter: ListMembershipCartsFilter) {
    clubMembershipCarts(filter: $filter) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_MEMBERSHIP_CART = gql`
  query ClubMembershipCart($id: ID!) {
    clubMembershipCart(id: $id) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_OPEN_MEMBERSHIP_CART = gql`
  mutation ClubOpenMembershipCart($input: OpenMembershipCartInput!) {
    clubOpenMembershipCart(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_CREATE_ADDITIONAL_CART = gql`
  mutation ClubCreateAdditionalMembershipCart(
    $input: OpenMembershipCartInput!
  ) {
    clubCreateAdditionalMembershipCart(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_UPDATE_CART_ITEM = gql`
  mutation ClubUpdateCartItem($input: UpdateMembershipCartItemInput!) {
    clubUpdateCartItem(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_TOGGLE_CART_LICENSE = gql`
  mutation ClubToggleCartItemLicense($input: ToggleCartItemLicenseInput!) {
    clubToggleCartItemLicense(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_REMOVE_CART_ITEM = gql`
  mutation ClubRemoveCartItem($itemId: ID!) {
    clubRemoveCartItem(itemId: $itemId) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_APPLY_EXCEPTIONAL_DISCOUNT = gql`
  mutation ClubApplyCartItemExceptionalDiscount(
    $input: ApplyCartItemExceptionalDiscountInput!
  ) {
    clubApplyCartItemExceptionalDiscount(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_VALIDATE_CART = gql`
  mutation ClubValidateMembershipCart($input: ValidateMembershipCartInput!) {
    clubValidateMembershipCart(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

export const CLUB_CANCEL_CART = gql`
  mutation ClubCancelMembershipCart($input: CancelMembershipCartInput!) {
    clubCancelMembershipCart(input: $input) {
      ...AdminMembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

// ---------- Types ----------

export type MembershipCartStatus = 'OPEN' | 'VALIDATED' | 'CANCELLED';
export type BillingRhythm = 'ANNUAL' | 'MONTHLY';

export type AdminCartItem = {
  id: string;
  memberId: string;
  memberFullName: string;
  membershipProductId: string | null;
  membershipProductLabel: string | null;
  billingRhythm: BillingRhythm;
  hasExistingLicense: boolean;
  existingLicenseNumber: string | null;
  exceptionalDiscountCents: number;
  exceptionalDiscountReason: string | null;
  requiresManualAssignment: boolean;
  lineTotalCents: number;
  subscriptionBaseCents: number;
  subscriptionAdjustedCents: number;
  oneTimeFeesCents: number;
};

export type AdminCart = {
  id: string;
  clubId: string;
  familyId: string;
  clubSeasonId: string;
  clubSeasonLabel: string;
  payerFullName: string | null;
  status: MembershipCartStatus;
  validatedAt: string | null;
  invoiceId: string | null;
  cancelledReason: string | null;
  totalCents: number;
  requiresManualAssignmentCount: number;
  canValidate: boolean;
  items: AdminCartItem[];
};

export type ClubMembershipCartsData = {
  clubMembershipCarts: AdminCart[];
};

export type ClubMembershipCartData = {
  clubMembershipCart: AdminCart;
};
