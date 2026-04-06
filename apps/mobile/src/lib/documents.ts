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

