import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

@InputType()
export class EditChatMessageInput {
  @Field(() => ID)
  @IsUUID()
  messageId!: string;

  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;
}
