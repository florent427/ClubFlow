import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  ChatRoomChannelMode,
  ChatRoomKind,
  ChatRoomMemberRole,
  ChatRoomPermissionTarget,
} from '@prisma/client';

@ObjectType()
export class ChatMemberSnippetGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  pseudo!: string | null;

  @Field()
  firstName!: string;

  @Field()
  lastName!: string;
}

@ObjectType()
export class ChatRoomMemberGql {
  @Field(() => ID)
  memberId!: string;

  @Field(() => ChatRoomMemberRole)
  role!: ChatRoomMemberRole;

  @Field(() => ChatMemberSnippetGraph)
  member!: ChatMemberSnippetGraph;
}

@ObjectType()
export class ChatRoomWritePermissionGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ChatRoomPermissionTarget)
  targetKind!: ChatRoomPermissionTarget;

  @Field(() => String, { nullable: true })
  targetValue!: string | null;
}

@ObjectType()
export class ChatRoomMembershipScopeGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ChatRoomPermissionTarget)
  targetKind!: ChatRoomPermissionTarget;

  @Field(() => String, { nullable: true })
  targetValue!: string | null;

  @Field(() => ID, { nullable: true })
  dynamicGroupId!: string | null;
}

@ObjectType()
export class ChatRoomGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ChatRoomKind)
  kind!: ChatRoomKind;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => String, { nullable: true })
  coverImageUrl!: string | null;

  @Field(() => ChatRoomChannelMode)
  channelMode!: ChatRoomChannelMode;

  @Field()
  isBroadcastChannel!: boolean;

  @Field({ nullable: true })
  archivedAt!: Date | null;

  @Field()
  updatedAt!: Date;

  @Field(() => [ChatRoomMemberGql])
  members!: ChatRoomMemberGql[];

  /** Permissions d'écriture (RESTRICTED). Vide => tous les membres du salon. */
  @Field(() => [ChatRoomWritePermissionGql])
  writePermissions!: ChatRoomWritePermissionGql[];

  /** Scopes d'inscription auto. Vide => salon manuel. */
  @Field(() => [ChatRoomMembershipScopeGql])
  membershipScopes!: ChatRoomMembershipScopeGql[];

  /**
   * Vrai si le viewer (membre courant) peut poster un message racine dans
   * ce salon. Calculé côté serveur via `canWrite`.
   */
  @Field()
  viewerCanPost!: boolean;

  /**
   * Vrai si le viewer peut au moins répondre en fil (toujours true pour
   * un membre du salon, sauf si READ_ONLY).
   */
  @Field()
  viewerCanReply!: boolean;
}
