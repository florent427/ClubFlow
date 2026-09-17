import { gql } from '@apollo/client';

export const MESSAGE_FIELDS = `
  id
  roomId
  body
  createdAt
  editedAt
  parentMessageId
  replyCount
  lastReplyAt
  postedByAdmin
  sender {
    id
    pseudo
    firstName
    lastName
  }
  reactions {
    emoji
    count
    reactedByViewer
  }
`;

export const ROOM_FIELDS = `
  id
  kind
  name
  description
  channelMode
  isBroadcastChannel
  archivedAt
  updatedAt
  viewerCanPost
  viewerCanReply
  members {
    memberId
    role
    member {
      id
      pseudo
      firstName
      lastName
    }
  }
`;

export const VIEWER_TOGGLE_REACTION = gql`
  mutation ViewerToggleReaction($messageId: ID!, $emoji: String!) {
    viewerToggleChatMessageReaction(
      input: { messageId: $messageId, emoji: $emoji }
    ) {
      emoji
      count
      reactedByViewer
    }
  }
`;
