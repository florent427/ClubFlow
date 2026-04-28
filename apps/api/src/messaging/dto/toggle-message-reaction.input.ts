import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsUUID, Length } from 'class-validator';

@InputType()
export class ToggleMessageReactionInput {
  @Field(() => ID)
  @IsUUID()
  messageId!: string;

  /**
   * Emoji court (Unicode). Max 16 caractères pour gérer
   * les emojis composés (ex: 👨‍👩‍👧‍👦).
   */
  @Field()
  @IsString()
  @Length(1, 16)
  emoji!: string;
}
