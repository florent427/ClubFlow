import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class PostChatMessageInput {
  @Field(() => ID)
  @IsUUID()
  roomId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;

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
