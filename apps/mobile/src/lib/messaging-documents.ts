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
      photoUrl
    }
  }
`;

const MESSAGE_FIELDS = `
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
    photoUrl
  }
  reactions {
    emoji
    count
    reactedByViewer
  }
  attachments {
    id
    kind
    mediaAssetId
    mediaUrl
    thumbnailUrl
    fileName
    mimeType
    sizeBytes
    durationMs
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

export const VIEWER_EDIT_CHAT_MESSAGE = gql`
  mutation ViewerEditChatMessage($input: EditChatMessageInput!) {
    viewerEditChatMessage(input: $input) {
      ${MESSAGE_FIELDS}
    }
  }
`;

export const VIEWER_DELETE_CHAT_MESSAGE = gql`
  mutation ViewerDeleteChatMessage($messageId: ID!) {
    viewerDeleteChatMessage(messageId: $messageId)
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

/**
 * Recherche d'adhérents pour démarrer un chat 1-on-1.
 * Match insensible à la casse sur pseudo, firstName, lastName.
 */
export const VIEWER_SEARCH_CLUB_MEMBERS = gql`
  query ViewerSearchClubMembers($q: String!, $limit: Float) {
    viewerSearchClubMembers(q: $q, limit: $limit) {
      id
      firstName
      lastName
      pseudo
      photoUrl
    }
  }
`;

/**
 * Crée (ou récupère, idempotent) un salon DIRECT 1-on-1 avec un peer.
 */
export const VIEWER_GET_OR_CREATE_DIRECT_CHAT = gql`
  mutation ViewerGetOrCreateDirectChat($peerMemberId: ID!) {
    viewerGetOrCreateDirectChat(peerMemberId: $peerMemberId) {
      ${ROOM_FIELDS}
    }
  }
`;
