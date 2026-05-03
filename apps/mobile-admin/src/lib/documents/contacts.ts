import { gql } from '@apollo/client';

/**
 * GraphQL documents — module Contacts (CRM). Annuaire des prospects /
 * anciens membres non-licenciés.
 */

export const CLUB_CONTACTS = gql`
  query ClubContacts {
    clubContacts {
      id
      firstName
      lastName
      email
      emailVerified
      linkedMemberId
      canDeleteContact
    }
  }
`;

export const PROMOTE_CONTACT_TO_MEMBER = gql`
  mutation PromoteContactToMember($id: ID!) {
    promoteContactToMember(id: $id) {
      memberId
    }
  }
`;

export const DELETE_CLUB_CONTACT = gql`
  mutation DeleteClubContact($id: ID!) {
    deleteClubContact(id: $id)
  }
`;
