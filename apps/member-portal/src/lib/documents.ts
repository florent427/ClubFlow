import { gql } from '@apollo/client';

export const LOGIN_WITH_PROFILES = gql`
  mutation MemberLogin($input: LoginInput!) {
    login(input: $input) {
      accessToken
      contactClubId
      viewerProfiles {
        memberId
        contactId
        clubId
        firstName
        lastName
        isPrimaryProfile
        familyId
        householdGroupId
      }
    }
  }
`;

export const REGISTER_CONTACT = gql`
  mutation RegisterContact($input: RegisterContactInput!) {
    registerContact(input: $input) {
      ok
      requiresEmailVerification
    }
  }
`;

/**
 * Vue publique d'un club par son slug — utilisé par RegisterPage pour
 * afficher "Vous rejoignez X" quand l'URL contient `?club=<slug>`.
 * Pas d'auth requise.
 */
export const CLUB_BY_SLUG = gql`
  query ClubBySlug($slug: String!) {
    clubBySlug(slug: $slug) {
      id
      slug
      name
      logoUrl
      customDomain
      tagline
    }
  }
`;

/**
 * Recherche publique de clubs — utilisée sur RegisterPage et LoginPage
 * pour proposer un sélecteur quand l'URL n'a pas de `?club=<slug>`.
 * Pas d'auth requise. Backend filtre name OR slug, max 20 résultats.
 */
export const SEARCH_PUBLIC_CLUBS = gql`
  query SearchPublicClubs($query: String!) {
    searchPublicClubs(query: $query) {
      id
      slug
      name
      logoUrl
      tagline
    }
  }
`;

export const VERIFY_EMAIL = gql`
  mutation VerifyEmail($input: VerifyEmailInput!) {
    verifyEmail(input: $input) {
      accessToken
      contactClubId
      viewerProfiles {
        memberId
        contactId
        clubId
      }
    }
  }
`;

export const RESEND_VERIFICATION = gql`
  mutation ResendVerification($input: ResendVerificationInput!) {
    resendVerificationEmail(input: $input) {
      ok
    }
  }
`;

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
    requestPasswordReset(input: $input) {
      ok
    }
  }
`;

export const RESET_PASSWORD = gql`
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input) {
      accessToken
      contactClubId
      viewerProfiles {
        memberId
        contactId
        clubId
      }
    }
  }
`;

export const VIEWER_PROFILES = gql`
  query MemberViewerProfiles {
    viewerProfiles {
      memberId
      contactId
      clubId
      firstName
      lastName
      isPrimaryProfile
      familyId
      householdGroupId
      clubName
      clubLogoUrl
    }
  }
`;

export const SELECT_VIEWER_PROFILE = gql`
  mutation SelectViewerProfile($memberId: ID!) {
    selectActiveViewerProfile(memberId: $memberId) {
      accessToken
      contactClubId
      viewerProfiles {
        memberId
        contactId
        clubId
      }
    }
  }
`;

export const SELECT_VIEWER_CONTACT_PROFILE = gql`
  mutation SelectViewerContactProfile($contactId: ID!) {
    selectActiveViewerContactProfile(contactId: $contactId) {
      accessToken
      contactClubId
      viewerProfiles {
        memberId
        contactId
        clubId
      }
    }
  }
`;
