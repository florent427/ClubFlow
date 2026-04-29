import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';
import { ChatMemberSnippetGraph } from './chat-room-gql.model';

@ObjectType()
export class ChatMessageReactionGroupGql {
  /** Emoji court (Unicode). */
  @Field(() => String)
  emoji!: string;

  /** Nombre total de membres ayant réagi avec cet emoji sur ce message. */
  @Field(() => Int)
  count!: number;

  /** Vrai si l'utilisateur courant a déjà cette réaction. */
  @Field(() => Boolean)
  reactedByViewer!: boolean;
}

@ObjectType()
export class ChatMessageGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  roomId!: string;

  @Field(() => String)
  body!: string;

  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  @Field(() => ChatMemberSnippetGraph)
  sender!: ChatMemberSnippetGraph;

  /** ID du message parent si réponse en fil ; null sinon. */
  @Field(() => ID, { nullable: true })
  parentMessageId!: string | null;

  /** Nombre de réponses en fil (compteur dénormalisé). 0 si pas de fil. */
  @Field(() => Int)
  replyCount!: number;

  /** Date de la dernière réponse (utile pour ordre/affichage). */
  @Field(() => GraphQLISODateTime, { nullable: true })
  lastReplyAt!: Date | null;

  /** Date de la dernière édition (null si jamais édité). */
  @Field(() => GraphQLISODateTime, { nullable: true })
  editedAt!: Date | null;

  /** Réactions agrégées par emoji. */
  @Field(() => [ChatMessageReactionGroupGql])
  reactions!: ChatMessageReactionGroupGql[];

  /** Si true : l'admin a posté ce message en se faisant passer pour le sender. */
  @Field(() => Boolean)
  postedByAdmin!: boolean;
}
