import { gql } from '@apollo/client';

export const VIEWER_ADMIN_SWITCH = gql`
  query ViewerAdminSwitch {
    viewerAdminSwitch {
      canAccessClubBackOffice
      adminWorkspaceClubId
    }
  }
`;

export const VIEWER_ME = gql`
  query ViewerMe {
    viewerMe {
      id
      firstName
      lastName
      photoUrl
      civility
      pseudo
      medicalCertExpiresAt
      gradeLevelId
      gradeLevelLabel
      canAccessClubBackOffice
      adminWorkspaceClubId
      hasClubFamily
      canSelfAttachFamilyViaPayerEmail
      isContactProfile
      hideMemberModules
      telegramLinked
    }
  }
`;

export const VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL = gql`
  mutation ViewerJoinFamilyByPayerEmail($input: ViewerJoinFamilyByPayerEmailInput!) {
    viewerJoinFamilyByPayerEmail(input: $input) {
      success
      message
      familyId
      familyLabel
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
      isHouseholdGroupSpace
      linkedHouseholdFamilies {
        familyId
        label
        members {
          memberId
          firstName
          lastName
          photoUrl
        }
      }
      invoices {
        id
        label
        status
        dueAt
        amountCents
        totalPaidCents
        balanceCents
        payments {
          id
          amountCents
          method
          createdAt
          paidByFirstName
          paidByLastName
        }
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

export const VIEWER_CLUB_ANNOUNCEMENTS = gql`
  query ViewerClubAnnouncements {
    viewerClubAnnouncements {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

const VIEWER_SURVEY_FIELDS = `
  id
  title
  description
  status
  multipleChoice
  allowAnonymous
  publishedAt
  closesAt
  totalResponses
  viewerSelectedOptionIds
  options {
    id
    label
    sortOrder
    responseCount
  }
`;

export const VIEWER_CLUB_SURVEYS = gql`
  query ViewerClubSurveys {
    viewerClubSurveys {
      ${VIEWER_SURVEY_FIELDS}
    }
  }
`;

export const VIEWER_RESPOND_TO_CLUB_SURVEY = gql`
  mutation ViewerRespondToClubSurvey($input: RespondSurveyInput!) {
    viewerRespondToClubSurvey(input: $input) {
      ${VIEWER_SURVEY_FIELDS}
    }
  }
`;

const VIEWER_EVENT_FIELDS = `
  id
  title
  description
  location
  startsAt
  endsAt
  capacity
  registrationOpensAt
  registrationClosesAt
  priceCents
  status
  allowContactRegistration
  registeredCount
  waitlistCount
  viewerRegistrationStatus
`;

export const VIEWER_CLUB_EVENTS = gql`
  query ViewerClubEvents {
    viewerClubEvents {
      ${VIEWER_EVENT_FIELDS}
    }
  }
`;

export const VIEWER_REGISTER_TO_EVENT = gql`
  mutation ViewerRegisterToEvent($eventId: ID!, $note: String) {
    viewerRegisterToEvent(eventId: $eventId, note: $note) {
      ${VIEWER_EVENT_FIELDS}
    }
  }
`;

export const VIEWER_CANCEL_EVENT_REGISTRATION = gql`
  mutation ViewerCancelEventRegistration($eventId: ID!) {
    viewerCancelEventRegistration(eventId: $eventId) {
      ${VIEWER_EVENT_FIELDS}
    }
  }
`;

export const VIEWER_BOOKABLE_COURSE_SLOTS = gql`
  query ViewerBookableCourseSlots {
    viewerBookableCourseSlots {
      id
      title
      startsAt
      endsAt
      venueName
      coachFirstName
      coachLastName
      bookingCapacity
      bookingOpensAt
      bookingClosesAt
      bookedCount
      waitlistCount
      viewerBookingStatus
    }
  }
`;

export const VIEWER_BOOK_COURSE_SLOT = gql`
  mutation ViewerBookCourseSlot($slotId: ID!, $note: String) {
    viewerBookCourseSlot(slotId: $slotId, note: $note)
  }
`;

export const VIEWER_CANCEL_COURSE_SLOT_BOOKING = gql`
  mutation ViewerCancelCourseSlotBooking($slotId: ID!) {
    viewerCancelCourseSlotBooking(slotId: $slotId)
  }
`;
