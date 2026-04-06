import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ChatMemberSnippetGraph } from './chat-room-gql.model';

@ObjectType()
export class ChatMessageGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  roomId!: string;

  @Field()
  body!: string;

  @Field()
  createdAt!: Date;

  @Field(() => ChatMemberSnippetGraph)
  sender!: ChatMemberSnippetGraph;
}
