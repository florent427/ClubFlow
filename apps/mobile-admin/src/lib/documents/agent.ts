import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour l'agent IA Aïko.
 * Cf apps/api/src/agent/agent.resolver.ts.
 *
 * `startAgentConversation` accepte StartAgentConversationInput (title?, projectId?).
 * `sendAgentMessage` accepte SendAgentMessageInput (conversationId, content,
 * attachmentIds?). Renvoie un `AgentTurnResultGraph` avec assistantMessageId,
 * assistantText, toolCalls, hasPendingActions.
 *
 * `agentAuditLog` est réservé aux admins du club (CLUB_ADMIN/BOARD).
 */

export const AGENT_CONVERSATIONS = gql`
  query AgentConversations {
    agentConversations {
      id
      title
      createdAt
      updatedAt
    }
  }
`;

export const AGENT_MESSAGES = gql`
  query AgentMessages($conversationId: ID!) {
    agentMessages(conversationId: $conversationId) {
      id
      role
      content
      createdAt
    }
  }
`;

export const START_AGENT_CONVERSATION = gql`
  mutation StartAgentConversation($input: StartAgentConversationInput!) {
    startAgentConversation(input: $input) {
      id
      title
      createdAt
      updatedAt
    }
  }
`;

export const SEND_AGENT_MESSAGE = gql`
  mutation SendAgentMessage($input: SendAgentMessageInput!) {
    sendAgentMessage(input: $input) {
      assistantMessageId
      assistantText
      hasPendingActions
    }
  }
`;

export const AGENT_AUDIT_LOG = gql`
  query AgentAuditLog($limit: Int) {
    agentAuditLog(limit: $limit) {
      id
      createdAt
      toolName
      status
      riskLevel
      errorMessage
    }
  }
`;
