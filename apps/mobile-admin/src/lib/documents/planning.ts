import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour les modules PLANNING + BOOKING (côté admin).
 * Cf apps/api/src/planning/planning.resolver.ts et booking.resolver.ts.
 */

export const CLUB_VENUES = gql`
  query ClubVenues {
    clubVenues {
      id
      name
      addressLine
    }
  }
`;

export const CLUB_COURSE_SLOTS = gql`
  query ClubCourseSlots {
    clubCourseSlots {
      id
      venueId
      coachMemberId
      title
      startsAt
      endsAt
      bookingEnabled
      bookingCapacity
      bookedCount
      waitlistCount
    }
  }
`;

export const DELETE_COURSE_SLOT = gql`
  mutation DeleteCourseSlot($id: ID!) {
    deleteClubCourseSlot(id: $id)
  }
`;

export const CLUB_COURSE_SLOT_BOOKINGS = gql`
  query ClubCourseSlotBookings($slotId: ID!) {
    clubCourseSlotBookings(slotId: $slotId) {
      id
      memberId
      status
      bookedAt
      cancelledAt
      note
      displayName
    }
  }
`;

export const CREATE_CLUB_COURSE_SLOT = gql`
  mutation CreateClubCourseSlot($input: CreateCourseSlotInput!) {
    createClubCourseSlot(input: $input) {
      id
      title
      startsAt
      endsAt
    }
  }
`;
