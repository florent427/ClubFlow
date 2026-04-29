import { gql } from '@apollo/client';

export const CLUB_GRANT_APPLICATIONS = gql`
  query ClubGrantApplications($status: GrantApplicationStatus) {
    clubGrantApplications(status: $status) {
      id
      title
      fundingBody
      status
      requestedAmountCents
      grantedAmountCents
      projectTitle
      startsAt
      endsAt
      reportDueAt
    }
  }
`;

export const CLUB_GRANT_APPLICATION = gql`
  query ClubGrantApplication($id: ID!) {
    clubGrantApplication(id: $id) {
      id
      title
      fundingBody
      status
      requestedAmountCents
      grantedAmountCents
      projectId
      projectTitle
      startsAt
      endsAt
      reportDueAt
      reportSubmittedAt
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

export const SUBMIT_GRANT = gql`
  mutation SubmitGrant($id: ID!) {
    submitClubGrantApplication(id: $id) {
      id
      status
    }
  }
`;

export const REJECT_GRANT = gql`
  mutation RejectGrant($id: ID!) {
    rejectClubGrantApplication(id: $id) {
      id
      status
    }
  }
`;

export const MARK_GRANT_REPORTED = gql`
  mutation MarkGrantReported($id: ID!) {
    markClubGrantReported(id: $id) {
      id
      status
    }
  }
`;

export const SETTLE_GRANT = gql`
  mutation SettleGrant($id: ID!) {
    settleClubGrantApplication(id: $id) {
      id
      status
    }
  }
`;

export const ARCHIVE_GRANT = gql`
  mutation ArchiveGrant($id: ID!) {
    archiveClubGrantApplication(id: $id) {
      id
      status
    }
  }
`;

export const DELETE_GRANT = gql`
  mutation DeleteGrant($id: ID!) {
    deleteClubGrantApplication(id: $id)
  }
`;
