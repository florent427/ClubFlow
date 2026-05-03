import { gql } from '@apollo/client';

/**
 * Cf apps/api/src/dashboard/dashboard.resolver.ts -> adminDashboardSummary.
 */
export const ADMIN_DASHBOARD_SUMMARY = gql`
  query AdminDashboardSummary {
    adminDashboardSummary {
      activeMembersCount
      activeModulesCount
      upcomingSessionsCount
      outstandingPaymentsCount
      revenueCentsMonth
      newMembersThisMonthCount
      upcomingEventsCount
      recentAnnouncementsCount
      pendingShopOrdersCount
      openGrantApplicationsCount
      activeSponsorshipDealsCount
      accountingBalanceCents
    }
  }
`;
