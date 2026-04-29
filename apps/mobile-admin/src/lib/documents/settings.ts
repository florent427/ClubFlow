import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour le module SETTINGS (côté admin).
 *
 * Particularités :
 *  - clubMemberFieldLayout retourne `catalogSettings` + `customFieldDefinitions`
 *    (et non `catalogFields`/`customFields`).
 *  - clubMembershipPricingRules expose `pattern`, `label`, `isActive`,
 *    `priority`, `configJson` (pas de `discountPercent` direct).
 *  - clubSendingDomains : champ `fqdn` (pas `domain`), `verificationStatus`
 *    (pas `status`).
 *  - Mutation toggle module : `setClubModuleEnabled(moduleCode, enabled)`.
 */

export const CLUB_MEMBER_FIELD_LAYOUT = gql`
  query ClubMemberFieldLayout {
    clubMemberFieldLayout {
      catalogSettings {
        id
        fieldKey
        showOnForm
        required
        sortOrder
      }
      customFieldDefinitions {
        id
        code
        label
        type
        required
        sortOrder
        visibleToMember
      }
    }
  }
`;

export const CLUB_MEMBERSHIP_PRICING_RULES = gql`
  query ClubMembershipPricingRules {
    clubMembershipPricingRules {
      id
      pattern
      label
      isActive
      priority
      configJson
    }
  }
`;

export const CLUB_MEMBERSHIP_SETTINGS = gql`
  query ClubMembershipSettings {
    clubMembershipSettings {
      fullPriceFirstMonths
    }
  }
`;

export const CLUB_SENDING_DOMAINS = gql`
  query ClubSendingDomains {
    clubSendingDomains {
      id
      fqdn
      purpose
      verificationStatus
    }
  }
`;

export const UPDATE_MEMBERSHIP_SETTINGS = gql`
  mutation UpdateMembershipSettings($fullPriceFirstMonths: Int!) {
    updateClubMembershipSettings(fullPriceFirstMonths: $fullPriceFirstMonths) {
      fullPriceFirstMonths
    }
  }
`;

export const DELETE_MEMBERSHIP_PRICING_RULE = gql`
  mutation DeleteMembershipPricingRule($id: ID!) {
    deleteClubMembershipPricingRule(id: $id)
  }
`;

export const DELETE_SENDING_DOMAIN = gql`
  mutation DeleteSendingDomain($domainId: ID!) {
    deleteClubSendingDomain(domainId: $domainId)
  }
`;

export const SET_CLUB_MODULE_ENABLED = gql`
  mutation SetClubModuleEnabled($moduleCode: ModuleCode!, $enabled: Boolean!) {
    setClubModuleEnabled(moduleCode: $moduleCode, enabled: $enabled) {
      id
      moduleCode
      enabled
    }
  }
`;
