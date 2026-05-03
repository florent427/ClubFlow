import { gql } from '@apollo/client';

export type AgentRiskLevel = 'SAFE' | 'GUARDED' | 'DESTRUCTIVE' | 'FORBIDDEN';
export type AgentMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
export type AgentToolCallStatus =
  | 'PENDING_CONFIRMATION'
  | 'EXECUTED'
  | 'REFUSED'
  | 'FAILED'
  | 'BLOCKED_BY_LIMITS'
  | 'BLOCKED_BY_SCOPE';

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
      toolCalls {
        id
        toolName
        riskLevel
        status
        pendingActionId
        errorMessage
      }
      attachments {
        mediaAssetId
        kind
        mimeType
        fileName
        publicUrl
      }
    }
  }
`;

export const AGENT_PENDING_ACTIONS = gql`
  query AgentPendingActions($conversationId: ID!) {
    agentPendingActions(conversationId: $conversationId) {
      id
      toolName
      riskLevel
      previewText
      argsPreview
      expiresAt
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
      conversationId
      userId
      errorMessage
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
      toolCalls {
        toolName
        status
        resultSummary
        pendingActionId
        previewText
        errorMessage
      }
      totalInputTokens
      totalOutputTokens
      hasPendingActions
    }
  }
`;

export const CONFIRM_AGENT_PENDING_ACTION = gql`
  mutation ConfirmAgentPendingAction($input: ConfirmAgentPendingActionInput!) {
    confirmAgentPendingAction(input: $input) {
      toolName
      success
      error
      conversationId
    }
  }
`;

export interface AgentConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolCall {
  id: string;
  toolName: string;
  riskLevel: AgentRiskLevel;
  status: AgentToolCallStatus;
  pendingActionId: string | null;
  errorMessage: string | null;
}

export interface AgentAttachment {
  mediaAssetId: string;
  kind: 'IMAGE' | 'DOCUMENT';
  mimeType: string;
  fileName: string;
  publicUrl: string;
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
  toolCalls: AgentToolCall[];
  attachments: AgentAttachment[];
}

export interface AgentPendingAction {
  id: string;
  toolName: string;
  riskLevel: AgentRiskLevel;
  previewText: string;
  argsPreview: string;
  expiresAt: string;
}

export interface AgentAuditEntry {
  id: string;
  createdAt: string;
  toolName: string;
  status: AgentToolCallStatus;
  riskLevel: AgentRiskLevel;
  conversationId: string;
  userId: string;
  errorMessage: string | null;
}
