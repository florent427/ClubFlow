import { gql } from '@apollo/client';

const ROOM_FIELDS = `
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

const MESSAGE_FIELDS = `
  id
  roomId
  body
  createdAt
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

export const VIEWER_CHAT_ROOMS = gql`
  query ViewerChatRooms {
    viewerChatRooms {
      ${ROOM_FIELDS}
    }
  }
`;

export const VIEWER_CHAT_MESSAGES = gql`
  query ViewerChatMessages($roomId: ID!, $beforeMessageId: ID) {
    viewerChatMessages(roomId: $roomId, beforeMessageId: $beforeMessageId) {
      ${MESSAGE_FIELDS}
    }
  }
`;

export const VIEWER_CHAT_THREAD_REPLIES = gql`
  query ViewerChatThreadReplies($roomId: ID!, $parentMessageId: ID!) {
    viewerChatThreadReplies(roomId: $roomId, parentMessageId: $parentMessageId) {
      ${MESSAGE_FIELDS}
    }
  }
`;

export const VIEWER_POST_CHAT_MESSAGE = gql`
  mutation ViewerPostChatMessage($input: PostChatMessageInput!) {
    viewerPostChatMessage(input: $input) {
      ${MESSAGE_FIELDS}
    }
  }
`;

export const VIEWER_TOGGLE_CHAT_MESSAGE_REACTION = gql`
  mutation ViewerToggleChatMessageReaction(
    $input: ToggleMessageReactionInput!
  ) {
    viewerToggleChatMessageReaction(input: $input) {
      emoji
      count
      reactedByViewer
    }
  }
`;

export const VIEWER_UPDATE_MY_PSEUDO = gql`
  mutation ViewerUpdateMyPseudo($input: ViewerUpdateMyPseudoInput!) {
    viewerUpdateMyPseudo(input: $input) {
      id
      pseudo
      firstName
      lastName
    }
  }
`;

export const VIEWER_CREATE_CHAT_GROUP = gql`
  mutation ViewerCreateChatGroup($input: CreateChatGroupInput!) {
    viewerCreateChatGroup(input: $input) {
      id
      kind
      name
      updatedAt
    }
  }
`;
