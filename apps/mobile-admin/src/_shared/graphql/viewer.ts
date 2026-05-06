import { gql } from '@apollo/client';

export const VIEWER_PROFILES = gql`
  query ViewerProfiles {
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
  }
`;

export const VIEWER_SYSTEM_ROLE = gql`
  query ViewerSystemRole {
    viewerSystemRole
  }
`;

export const VIEWER_ADMIN_SWITCH = gql`
  query ViewerAdminSwitch {
    viewerAdminSwitch {
      canAccessAdmin
      adminWorkspaceClubId
      role
    }
  }
`;
