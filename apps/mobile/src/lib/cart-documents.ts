import { gql } from '@apollo/client';

/**
 * Documents Apollo pour le panier d'adhésion mobile (parité avec
 * apps/member-portal/src/lib/cart-documents.ts).
 *
 * Le panier porte une saison + un foyer. Les `pendingItems` sont les
 * inscriptions ajoutées par le payeur (enfants ou self) dont la fiche
 * Member n'est pas encore créée — elle le sera à la validation du
 * panier.
 */

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
      requiresManualAssignment
      lineTotalCents
      subscriptionAdjustedCents
      oneTimeFeesCents
      oneTimeFeeOverrideIds
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

export const VIEWER_OPEN_CART = gql`
  mutation ViewerOpenMembershipCart {
    viewerOpenMembershipCart {
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

export const VIEWER_VALIDATE_CART = gql`
  mutation ViewerValidateMembershipCart($cartId: String!) {
    viewerValidateMembershipCart(cartId: $cartId) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

/**
 * Déclare/dédéclare une licence existante sur un cart item. Si
 * `hasExistingLicense=true`, le `existingLicenseNumber` doit respecter
 * le `licenseNumberPattern` configuré côté admin (regex JS) — le
 * serveur revérifie et rejette avec un message explicite si invalide.
 */
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

/**
 * Met à jour un cart item — utilisé pour cocher/décocher les frais
 * OPTIONAL (on passe `oneTimeFeeOverrideIds: [feeId, ...]`). Vide =
 * aucun OPTIONAL appliqué. Null = pas de surcharge (laisse le
 * système appliquer les autoApply).
 */
export const VIEWER_UPDATE_CART_ITEM = gql`
  mutation ViewerUpdateCartItem($input: ViewerUpdateCartItemInput!) {
    viewerUpdateCartItem(input: $input) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
`;

/**
 * Toggle license existante sur une INSCRIPTION EN ATTENTE (pending).
 * Pour les items déjà créés, utiliser VIEWER_TOGGLE_CART_LICENSE.
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

/**
 * Met à jour une inscription en attente : formules + rythme +
 * override des fees OPTIONAL. Pour le toggle license utiliser
 * VIEWER_TOGGLE_PENDING_LICENSE.
 */
export const VIEWER_UPDATE_PENDING_ITEM = gql`
  mutation ViewerUpdateCartPendingItem(
    $input: ViewerUpdateCartPendingItemInput!
  ) {
    viewerUpdateCartPendingItem(input: $input) {
      ...MembershipCartFields
    }
  }
  ${MEMBERSHIP_CART_FIELDS}
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
  requiresManualAssignment: boolean;
  lineTotalCents: number;
  subscriptionAdjustedCents: number;
  oneTimeFeesCents: number;
  oneTimeFeeOverrideIds: string[] | null;
};

export type CartPendingItem = {
  id: string;
  firstName: string;
  lastName: string;
  civility: 'MR' | 'MME';
  birthDate: string;
  membershipProductIds: string[];
  membershipProductLabels: string[];
  estimatedTotalCents: number;
  subscriptionAdjustedCents: number;
  oneTimeFeesCents: number;
  hasExistingLicense: boolean;
  existingLicenseNumber: string | null;
  oneTimeFeeOverrideIds: string[] | null;
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
  clubOneTimeFees: ClubOneTimeFee[];
};

export type ViewerActiveCartData = {
  viewerActiveMembershipCart: Cart | null;
};
