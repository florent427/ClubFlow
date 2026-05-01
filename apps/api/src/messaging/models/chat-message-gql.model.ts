import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { ChatMessageAttachmentKind } from '@prisma/client';
import { ChatMemberSnippetGraph } from './chat-room-gql.model';

registerEnumType(ChatMessageAttachmentKind, {
  name: 'ChatMessageAttachmentKind',
  description:
    "Type d'attachement de message chat — détermine le viewer côté client " +
    '(image inline, lecteur audio, lecteur vidéo, lien PDF).',
});

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

/**
 * Pièce jointe d'un message chat — pointe sur un MediaAsset uploadé
 * via le pipeline `/media/upload` (whitelist + magic-byte check).
 */
@ObjectType()
export class ChatMessageAttachmentGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ChatMessageAttachmentKind)
  kind!: ChatMessageAttachmentKind;

  /** ID du MediaAsset sous-jacent. */
  @Field(() => ID)
  mediaAssetId!: string;

  /** URL publique du média (servi via `GET /media/:id`). */
  @Field(() => String)
  mediaUrl!: string;

  /** URL d'un thumbnail (vidéo) — null si pas généré. */
  @Field(() => String, { nullable: true })
  thumbnailUrl!: string | null;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  /** Durée en millisecondes pour AUDIO et VIDEO. */
  @Field(() => Int, { nullable: true })
  durationMs!: number | null;
}

@ObjectType()
export class ChatMessageGql {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  roomId!: string;

  /**
   * Corps texte. Désormais nullable : un message peut être 100 %
   * pièces jointes (vocal seul, photo seule).
   */
  @Field(() => String, { nullable: true })
  body!: string | null;

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

  /** Pièces jointes (images, vidéos, vocaux, documents). */
  @Field(() => [ChatMessageAttachmentGql])
  attachments!: ChatMessageAttachmentGql[];

  /** Si true : l'admin a posté ce message en se faisant passer pour le sender. */
  @Field(() => Boolean)
  postedByAdmin!: boolean;
}
