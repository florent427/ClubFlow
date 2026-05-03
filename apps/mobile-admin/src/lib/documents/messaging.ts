import { gql } from '@apollo/client';

export const CLUB_CHAT_ROOMS_ADMIN = gql`
  query ClubChatRoomsAdmin {
    clubChatRoomsAdmin {
      id
      kind
      name
      description
      channelMode
      isBroadcastChannel
      archivedAt
      updatedAt
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
      viewerCanPost
      viewerCanReply
    }
  }
`;

export const CLUB_CHAT_ROOM_MESSAGES_ADMIN = gql`
  query ClubChatRoomMessagesAdmin($roomId: ID!, $beforeMessageId: ID) {
    clubChatRoomMessagesAdmin(
      roomId: $roomId
      beforeMessageId: $beforeMessageId
    ) {
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
    }
  }
`;

export const ADMIN_POST_CHAT_MESSAGE = gql`
  mutation AdminPostChatMessage($input: AdminPostChatMessageInput!) {
    adminPostChatMessage(input: $input) {
      id
      roomId
      body
      createdAt
      sender {
        id
        firstName
        lastName
      }
    }
  }
`;

export const ADMIN_ARCHIVE_CHAT_GROUP = gql`
  mutation AdminArchiveChatGroup($roomId: ID!) {
    adminArchiveChatGroup(roomId: $roomId)
  }
`;

export const ADMIN_CREATE_CHAT_GROUP = gql`
  mutation AdminCreateChatGroup($input: CreateAdminChatGroupInput!) {
    adminCreateChatGroup(input: $input) {
      id
      name
    }
  }
`;

export const ADMIN_UPDATE_CHAT_GROUP = gql`
  mutation AdminUpdateChatGroup($input: UpdateAdminChatGroupInput!) {
    adminUpdateChatGroup(input: $input) {
      id
      name
      description
    }
  }
`;

/**
 * Ouvre (ou crée) une room DIRECT entre l'admin connecté
 * (activeProfileMemberId) et un autre membre du club. Idempotent :
 * réutilise la room existante si elle existe déjà.
 */
export const VIEWER_GET_OR_CREATE_DIRECT_CHAT = gql`
  mutation ViewerGetOrCreateDirectChat($peerMemberId: ID!) {
    viewerGetOrCreateDirectChat(peerMemberId: $peerMemberId) {
      id
      kind
      name
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
    }
  }
`;
