import { gql } from '@apollo/client';

const COORDINATES_FIELDS = `
  phone
  addressLine
  postalCode
  city
  birthCity
  birthCityInseeCode
  birthCountryCode
`;

const STATUS_FIELDS = `
  account { ${COORDINATES_FIELDS} }
  accountComplete
  gaps {
    target
    targetId
    displayName
    missing
    requiresBirthPlace
    current { ${COORDINATES_FIELDS} }
  }
`;

/**
 * Coordonnées du compte payeur et, si `cartId` est donné, fiches du panier
 * à compléter avant validation (portable, adresse, ville de naissance).
 */
export const VIEWER_COORDINATES_STATUS = gql`
  query ViewerCoordinatesStatus($cartId: ID) {
    viewerCoordinatesStatus(cartId: $cartId) {
      ${STATUS_FIELDS}
    }
  }
`;

/**
 * Complète les coordonnées du compte (`ACCOUNT`), d'une inscription en
 * attente (`PENDING_ITEM`) ou d'un adhérent du foyer (`MEMBER`). Renvoie
 * l'état du compte seul : refetch avec le `cartId` pour les fiches du panier.
 */
export const VIEWER_UPDATE_COORDINATES = gql`
  mutation ViewerUpdateCoordinates($input: ViewerUpdateCoordinatesInput!) {
    viewerUpdateCoordinates(input: $input) {
      ${STATUS_FIELDS}
    }
  }
`;
