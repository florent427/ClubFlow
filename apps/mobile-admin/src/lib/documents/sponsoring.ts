import { gql } from '@apollo/client';

export const CLUB_SPONSORSHIP_DEALS = gql`
  query ClubSponsorshipDeals($status: SponsorshipDealStatus) {
    clubSponsorshipDeals(status: $status) {
      id
      sponsorName
      kind
      status
      valueCents
      amountCents
      inKindDescription
      projectTitle
      contactName
      startsAt
      endsAt
    }
  }
`;

export const CLUB_SPONSORSHIP_DEAL = gql`
  query ClubSponsorshipDeal($id: ID!) {
    clubSponsorshipDeal(id: $id) {
      id
      sponsorName
      kind
      status
      valueCents
      amountCents
      inKindDescription
      projectId
      projectTitle
      contactId
      contactName
      startsAt
      endsAt
      notes
      installments {
        id
        expectedAmountCents
        receivedAmountCents
        expectedAt
        receivedAt
      }
      documents {
        id
        mediaAssetId
        kind
      }
    }
  }
`;

export const ACTIVATE_SPONSORSHIP_DEAL = gql`
  mutation ActivateSponsorshipDeal($id: ID!) {
    activateClubSponsorshipDeal(id: $id) {
      id
      status
    }
  }
`;

export const CLOSE_SPONSORSHIP_DEAL = gql`
  mutation CloseSponsorshipDeal($id: ID!) {
    closeClubSponsorshipDeal(id: $id) {
      id
      status
    }
  }
`;

export const CANCEL_SPONSORSHIP_DEAL = gql`
  mutation CancelSponsorshipDeal($id: ID!) {
    cancelClubSponsorshipDeal(id: $id) {
      id
      status
    }
  }
`;

export const DELETE_SPONSORSHIP_DEAL = gql`
  mutation DeleteSponsorshipDeal($id: ID!) {
    deleteClubSponsorshipDeal(id: $id)
  }
`;
