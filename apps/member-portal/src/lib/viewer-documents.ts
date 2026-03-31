import { gql } from '@apollo/client';

export const VIEWER_ME = gql`
  query ViewerMe {
    viewerMe {
      id
      firstName
      lastName
      photoUrl
      civility
      medicalCertExpiresAt
      gradeLevelId
      gradeLevelLabel
      canAccessClubBackOffice
    }
  }
`;

export const VIEWER_UPCOMING_SLOTS = gql`
  query ViewerUpcomingCourseSlots {
    viewerUpcomingCourseSlots {
      id
      title
      startsAt
      endsAt
      venueName
      coachFirstName
      coachLastName
    }
  }
`;

export const VIEWER_FAMILY_BILLING = gql`
  query ViewerFamilyBillingSummary {
    viewerFamilyBillingSummary {
      isPayerView
      familyLabel
      invoices {
        id
        label
        status
        dueAt
        amountCents
        totalPaidCents
        balanceCents
      }
      familyMembers {
        memberId
        firstName
        lastName
        photoUrl
      }
    }
  }
`;

export const CLUB = gql`
  query MemberClub {
    club {
      id
      name
      slug
    }
  }
`;
