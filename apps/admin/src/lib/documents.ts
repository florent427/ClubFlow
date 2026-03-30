import { gql } from '@apollo/client';

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
    }
  }
`;

export const DASHBOARD_SUMMARY = gql`
  query AdminDashboardSummary {
    adminDashboardSummary {
      activeMembersCount
      activeModulesCount
      upcomingSessionsCount
      outstandingPaymentsCount
      revenueCentsMonth
    }
  }
`;

export const CLUB_MODULES = gql`
  query ClubModules {
    clubModules {
      id
      moduleCode
      enabled
    }
  }
`;

export const SET_MODULE = gql`
  mutation SetClubModule($code: ModuleCode!, $enabled: Boolean!) {
    setClubModuleEnabled(moduleCode: $code, enabled: $enabled) {
      moduleCode
      enabled
    }
  }
`;
