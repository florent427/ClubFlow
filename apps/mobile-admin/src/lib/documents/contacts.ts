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
    }
  }
`;
