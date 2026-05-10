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
        photoUrl
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
      photoUrl
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

// =====================================================
// Inscription / Vérification email (flow contact)
// =====================================================

export const REGISTER_CONTACT = gql`
  mutation RegisterContact($input: RegisterContactInput!) {
    registerContact(input: $input) {
      ok
      requiresEmailVerification
    }
  }
`;

/**
 * Reset password — démarre le flow (envoi de l'email avec le lien).
 * Le serveur retourne toujours `ok: true` (anti-énumération : on ne
 * révèle pas si l'email existe ou pas).
 */
export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
    requestPasswordReset(input: $input) {
      ok
    }
  }
`;

/**
 * Reset password — finalise via le token reçu par mail. Retourne un
 * accessToken + viewerProfiles pour login auto post-reset.
 */
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

