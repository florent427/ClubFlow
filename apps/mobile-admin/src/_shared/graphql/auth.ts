import { gql } from '@apollo/client';

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(input: { email: $email, password: $password }) {
      accessToken
      viewerProfiles {
        id
        memberId
        displayName
        isPrimaryProfile
        familyId
        club {
          id
          name
          logoUrl
        }
      }
      contactClubId
    }
  }
`;

export const SELECT_VIEWER_PROFILE = gql`
  mutation SelectActiveViewerProfile($memberId: ID!) {
    selectActiveViewerProfile(memberId: $memberId) {
      accessToken
    }
  }
`;

export const VERIFY_EMAIL = gql`
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token) {
      success
    }
  }
`;

export const REGISTER_CONTACT = gql`
  mutation RegisterContact(
    $email: String!
    $firstName: String!
    $lastName: String!
    $clubId: ID!
    $civility: String
  ) {
    registerContact(
      input: {
        email: $email
        firstName: $firstName
        lastName: $lastName
        clubId: $clubId
        civility: $civility
      }
    ) {
      success
    }
  }
`;
