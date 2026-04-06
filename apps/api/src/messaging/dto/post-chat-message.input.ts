import { Field, ID, InputType } from '@nestjs/graphql';
import { IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class PostChatMessageInput {
  @Field(() => ID)
  roomId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;
}
