import { gql } from '@apollo/client';

/**
 * GraphQL documents — module Memberships (paniers d'adhésion).
 * Note : on récupère un sous-ensemble des champs réels du `MembershipCart`
 * backend. Si la query renvoie une erreur (module désactivé p.ex.),
 * l'écran retombe sur un état "Module en cours".
 */

export const CLUB_MEMBERSHIP_CARTS = gql`
  query ClubMembershipCarts {
    clubMembershipCarts {
      id
      familyId
      payerFullName
      status
      totalCents
      createdAt
      updatedAt
      items {
        id
        memberFullName
        membershipProductLabel
        lineTotalCents
      }
    }
  }
`;

export const CLUB_MEMBERSHIP_CART = gql`
  query ClubMembershipCart($id: ID!) {
    clubMembershipCart(id: $id) {
      id
      familyId
      payerFullName
      status
      totalCents
      createdAt
      updatedAt
      items {
        id
        memberFullName
        membershipProductLabel
        billingRhythm
        subscriptionAdjustedCents
        oneTimeFeesCents
        lineTotalCents
      }
      pendingItems {
        id
        firstName
        lastName
        membershipProductLabels
        estimatedTotalCents
      }
    }
  }
`;
