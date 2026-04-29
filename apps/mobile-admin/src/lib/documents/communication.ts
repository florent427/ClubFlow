import { gql } from '@apollo/client';

export const CLUB_MESSAGE_CAMPAIGNS = gql`
  query ClubMessageCampaigns {
    clubMessageCampaigns {
      id
      label
      type
      status
      recipientCount
      subject
      body
      createdAt
      sentAt
    }
  }
`;

export const SEND_CAMPAIGN = gql`
  mutation SendCampaign($id: ID!) {
    sendClubMessageCampaign(campaignId: $id) {
      id
      status
      sentAt
    }
  }
`;

export const DELETE_CAMPAIGN = gql`
  mutation DeleteCampaign($id: ID!) {
    deleteClubMessageCampaign(campaignId: $id)
  }
`;

export const SEND_QUICK_MESSAGE = gql`
  mutation SendQuickMessage($input: SendQuickMessageInput!) {
    sendClubQuickMessage(input: $input) {
      sent
      failed
    }
  }
`;
