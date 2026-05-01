import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

@InputType()
export class PostChatMessageInput {
  @Field(() => ID)
  @IsUUID()
  roomId!: string;

  /**
   * Corps texte. **Optionnel** : un message peut être 100 % pièces
   * jointes (vocal seul, photo seule). Le service vérifie qu'au moins
   * `body` (non vide) ou `attachmentMediaAssetIds` est présent.
   */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string | null;

  /**
   * IDs de MediaAsset à attacher au message. Chaque asset doit avoir
   * été uploadé via `POST /media/upload` AVANT cette mutation, et
   * appartenir au même club. Limite : 10 attachments par message.
   */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachmentMediaAssetIds?: string[] | null;

  /**
   * Si fourni, le message est une réponse en fil au message désigné.
   * Doit appartenir au même salon. Les réponses sont permises même
   * lorsque le viewer n'a pas l'autorisation de poster un message
   * racine, sauf si le salon est en READ_ONLY.
   */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  parentMessageId?: string | null;
}
