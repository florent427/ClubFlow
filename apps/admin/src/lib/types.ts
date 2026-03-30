import type { ModuleCodeStr } from './module-catalog';

export type LoginMutationData = {
  login: { accessToken: string };
};

export type DashboardQueryData = {
  adminDashboardSummary: {
    activeMembersCount: number;
    activeModulesCount: number;
    upcomingSessionsCount: number;
    outstandingPaymentsCount: number;
    revenueCentsMonth: number;
  };
};

export type ClubModulesQueryData = {
  clubModules: { id: string; moduleCode: ModuleCodeStr; enabled: boolean }[];
};
