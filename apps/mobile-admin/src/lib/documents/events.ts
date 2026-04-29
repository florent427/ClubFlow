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
