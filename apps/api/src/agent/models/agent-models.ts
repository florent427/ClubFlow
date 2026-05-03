import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  AgentMessageRole,
  AgentRiskLevel,
  AgentToolCallStatus,
} from '@prisma/client';

registerEnumType(AgentMessageRole, { name: 'AgentMessageRole' });
registerEnumType(AgentRiskLevel, { name: 'AgentRiskLevel' });
registerEnumType(AgentToolCallStatus, { name: 'AgentToolCallStatus' });

@ObjectType()
export class AgentConversationGraph {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) title!: string | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class AgentToolCallGraph {
  @Field(() => ID) id!: string;
  @Field() toolName!: string;
  @Field(() => AgentRiskLevel) riskLevel!: AgentRiskLevel;
  @Field(() => AgentToolCallStatus) status!: AgentToolCallStatus;
  @Field(() => ID, { nullable: true }) pendingActionId!: string | null;
  @Field(() => String, { nullable: true }) errorMessage!: string | null;
}

@ObjectType()
export class AgentMessageAttachmentGraph {
  @Field(() => ID) mediaAssetId!: string;
  @Field() kind!: string;
  @Field() mimeType!: string;
  @Field() fileName!: string;
  @Field() publicUrl!: string;
}

@ObjectType()
export class AgentMessageGraph {
  @Field(() => ID) id!: string;
  @Field(() => AgentMessageRole) role!: AgentMessageRole;
  @Field() content!: string;
  @Field() createdAt!: Date;
  @Field(() => [AgentToolCallGraph]) toolCalls!: AgentToolCallGraph[];
  @Field(() => [AgentMessageAttachmentGraph]) attachments!: AgentMessageAttachmentGraph[];
}

@ObjectType()
export class AgentPendingActionGraph {
  @Field(() => ID) id!: string;
  @Field() toolName!: string;
  @Field(() => AgentRiskLevel) riskLevel!: AgentRiskLevel;
  @Field() previewText!: string;
  @Field() expiresAt!: Date;
  /** JSON stringifié des args (lecture seule côté UI). */
  @Field() argsPreview!: string;
}

@ObjectType()
export class AgentTurnToolCallTraceGraph {
  @Field() toolName!: string;
  @Field() status!: string;
  @Field(() => String, { nullable: true }) resultSummary!: string | null;
  @Field(() => ID, { nullable: true }) pendingActionId!: string | null;
  @Field(() => String, { nullable: true }) previewText!: string | null;
  @Field(() => String, { nullable: true }) errorMessage!: string | null;
}

@ObjectType()
export class AgentTurnResultGraph {
  @Field(() => ID) assistantMessageId!: string;
  @Field() assistantText!: string;
  @Field(() => [AgentTurnToolCallTraceGraph]) toolCalls!: AgentTurnToolCallTraceGraph[];
  @Field(() => Int) totalInputTokens!: number;
  @Field(() => Int) totalOutputTokens!: number;
  @Field() hasPendingActions!: boolean;
}

@ObjectType()
export class AgentConfirmResultGraph {
  @Field() toolName!: string;
  @Field() success!: boolean;
  @Field(() => String, { nullable: true }) error!: string | null;
  @Field(() => ID) conversationId!: string;
}

@ObjectType()
export class AgentAuditEntryGraph {
  @Field(() => ID) id!: string;
  @Field() createdAt!: Date;
  @Field() toolName!: string;
  @Field() status!: string;
  @Field(() => AgentRiskLevel) riskLevel!: AgentRiskLevel;
  @Field(() => ID) conversationId!: string;
  @Field(() => ID) userId!: string;
  @Field(() => String, { nullable: true }) errorMessage!: string | null;
}
