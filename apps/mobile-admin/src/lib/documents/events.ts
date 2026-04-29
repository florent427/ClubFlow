import { gql } from '@apollo/client';

/**
 * GraphQL documents — module Events. Champs minimaux pour les écrans
 * mobiles admin (liste + fiche). Le backend prime.
 */

export const CLUB_EVENTS = gql`
  query ClubEvents {
    clubEvents {
      id
      title
      description
      location
      startsAt
      endsAt
      capacity
      priceCents
      status
      publishedAt
      registeredCount
      waitlistCount
    }
  }
`;

export const PUBLISH_CLUB_EVENT = gql`
  mutation PublishClubEvent($id: ID!) {
    publishClubEvent(id: $id) {
      id
      status
    }
  }
`;

export const CANCEL_CLUB_EVENT = gql`
  mutation CancelClubEvent($id: ID!) {
    cancelClubEvent(id: $id) {
      id
      status
    }
  }
`;

export const DELETE_CLUB_EVENT = gql`
  mutation DeleteClubEvent($id: ID!) {
    deleteClubEvent(id: $id)
  }
`;

export const CREATE_CLUB_EVENT = gql`
  mutation CreateClubEvent($input: CreateEventInput!) {
    createClubEvent(input: $input) {
      id
      title
      status
    }
  }
`;

export const ADMIN_CANCEL_EVENT_REGISTRATION = gql`
  mutation AdminCancelEventRegistration($registrationId: ID!) {
    adminCancelEventRegistration(registrationId: $registrationId) {
      id
    }
  }
`;

export const CLUB_EVENT_REGISTRATIONS = gql`
  query ClubEventRegistrations {
    clubEvents {
      id
      title
      startsAt
      registrations {
        id
        eventId
        memberId
        contactId
        status
        registeredAt
        cancelledAt
        note
        displayName
      }
    }
  }
`;
