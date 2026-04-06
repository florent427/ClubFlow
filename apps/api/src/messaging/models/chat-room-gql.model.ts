import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ChatRoomKind, ChatRoomMemberRole } from '@prisma/client';

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
export class ChatRoomGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ChatRoomKind)
  kind!: ChatRoomKind;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field()
  updatedAt!: Date;

  @Field(() => [ChatRoomMemberGql])
  members!: ChatRoomMemberGql[];
}
