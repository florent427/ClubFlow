import { gql } from '@apollo/client';

export const DASHBOARD_SUMMARY = gql`
  query DashboardSummary {
    dashboardSummary {
      activeMembers
      newMembersThisMonth
      pendingPaymentsCount
      pendingPaymentsTotalCents
      upcomingEventsCount
      upcomingSlotsCount
      announcementsCount
      surveysOpenCount
      ordersThisMonth
      revenueThisMonthCents
      grantApplicationsActive
      sponsorshipDealsActive
      accountingBalanceCents
      accountingNeedsReviewCount
      messagingUnreadCount
    }
  }
`;
