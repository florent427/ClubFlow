import { gql } from '@apollo/client';

export const VIEWER_CHAT_ROOMS = gql`
  query ViewerChatRooms {
    viewerChatRooms {
      id
      kind
      name
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
    }
  }
`;

export const VIEWER_CHAT_MESSAGES = gql`
  query ViewerChatMessages($roomId: ID!, $beforeMessageId: ID) {
    viewerChatMessages(roomId: $roomId, beforeMessageId: $beforeMessageId) {
      id
      roomId
      body
      createdAt
      sender {
        id
        pseudo
        firstName
        lastName
      }
    }
  }
`;

export const VIEWER_POST_CHAT_MESSAGE = gql`
  mutation ViewerPostChatMessage($input: PostChatMessageInput!) {
    viewerPostChatMessage(input: $input) {
      id
      roomId
      body
      createdAt
      sender {
        id
        pseudo
        firstName
        lastName
      }
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
