import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

@InputType()
export class StartAgentConversationInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /**
   * Si renseigné, scoping sur un projet : la conversation reçoit un
   * addendum de system prompt avec le contexte projet. Utilisé par le
   * panneau « Agent » dans la vue projet admin.
   */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

@InputType()
export class SendAgentMessageInput {
  @Field(() => ID)
  @IsUUID()
  conversationId!: string;

  @Field()
  @IsString()
  @Length(1, 8000)
  content!: string;

  /** IDs des MediaAsset déjà uploadés à attacher au message (images, PDF…). */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

@InputType()
export class ConfirmAgentPendingActionInput {
  @Field(() => ID)
  @IsUUID()
  pendingActionId!: string;

  @Field()
  @IsBoolean()
  confirmed!: boolean;
}
