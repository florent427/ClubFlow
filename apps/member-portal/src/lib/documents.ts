import { gql } from '@apollo/client';

export const LOGIN_WITH_PROFILES = gql`
  mutation MemberLogin($input: LoginInput!) {
    login(input: $input) {
      accessToken
      contactClubId
      viewerProfiles {
        memberId
        clubId
        firstName
        lastName
        isPrimaryProfile
        familyId
      }
    }
  }
`;

export const REGISTER_CONTACT = gql`
  mutation RegisterContact($input: RegisterContactInput!) {
    registerContact(input: $input) {
      ok
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

export const VIEWER_PROFILES = gql`
  query MemberViewerProfiles {
    viewerProfiles {
      memberId
      clubId
      firstName
      lastName
      isPrimaryProfile
      familyId
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
        clubId
      }
    }
  }
`;
