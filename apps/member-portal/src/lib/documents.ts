import { gql } from '@apollo/client';

export const LOGIN_WITH_PROFILES = gql`
  mutation MemberLogin($input: LoginInput!) {
    login(input: $input) {
      accessToken
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
      viewerProfiles {
        memberId
        clubId
      }
    }
  }
`;
