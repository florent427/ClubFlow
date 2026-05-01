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
      email
      phone
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
      payerSpacePinSet
    }
  }
`;

export const VIEWER_UPDATE_MY_PROFILE = gql`
  mutation ViewerUpdateMyProfile($input: ViewerUpdateMyProfileInput!) {
    viewerUpdateMyProfile(input: $input) {
      id
      firstName
      lastName
      email
      phone
      photoUrl
    }
  }
`;

export const VIEWER_SET_PAYER_SPACE_PIN = gql`
  mutation ViewerSetPayerSpacePin($newPin: String!, $currentPin: String) {
    viewerSetPayerSpacePin(newPin: $newPin, currentPin: $currentPin) {
      ok
    }
  }
`;

export const VIEWER_CLEAR_PAYER_SPACE_PIN = gql`
  mutation ViewerClearPayerSpacePin($currentPin: String!) {
    viewerClearPayerSpacePin(currentPin: $currentPin) {
      ok
    }
  }
`;

// =====================================================
// Inscription depuis l'espace contact
// =====================================================

export const VIEWER_PROMOTE_SELF_TO_MEMBER = gql`
  mutation ViewerPromoteSelfToMember(
    $input: ViewerPromoteSelfToMemberInput!
  ) {
    viewerPromoteSelfToMember(input: $input) {
      memberId
      firstName
      lastName
    }
  }
`;

export const VIEWER_REGISTER_CHILD_MEMBER = gql`
  mutation ViewerRegisterChildMember(
    $input: ViewerRegisterChildMemberInput!
  ) {
    viewerRegisterChildMember(input: $input) {
      pendingItemId
      cartId
      firstName
      lastName
    }
  }
`;

// =====================================================
// Famille — invitations
// =====================================================

export const CREATE_FAMILY_INVITE = gql`
  mutation CreateFamilyInvite($input: CreateFamilyInviteInput!) {
    createFamilyInvite(input: $input) {
      code
      rawToken
      expiresAt
      familyId
    }
  }
`;

export const SEND_FAMILY_INVITE_BY_EMAIL = gql`
  mutation SendFamilyInviteByEmail($input: SendFamilyInviteByEmailInput!) {
    sendFamilyInviteByEmail(input: $input)
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

/**
 * Multi-foyer : retourne TOUS les foyers auxquels le viewer est rattaché.
 * Utilisé sur l'écran "Ma famille" mobile pour afficher des onglets quand
 * un payeur est dans plusieurs foyers (ex : famille reconstituée).
 */
export const VIEWER_ALL_FAMILY_BILLING = gql`
  query ViewerAllFamilyBillingSummaries {
    viewerAllFamilyBillingSummaries {
      familyId
      householdGroupId
      viewerRoleInFamily
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
        payers {
          firstName
          lastName
        }
        observers {
          firstName
          lastName
          role
        }
      }
      invoices {
        id
        familyId
        familyLabel
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
      requiresMedicalCertificate
    }
  }
`;

/**
 * Identité visuelle du club : couleurs (palette vitrine) + logo + nom +
 * tagline. Utilisée par le ThemeProvider mobile pour styliser
 * dynamiquement l'app aux couleurs du club courant.
 */
export const CLUB_BRANDING = gql`
  query ClubBranding {
    clubBranding {
      id
      name
      logoUrl
      tagline
      palette {
        ink
        ink2
        paper
        accent
        goldBright
        vermillion
        line
        muted
      }
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
