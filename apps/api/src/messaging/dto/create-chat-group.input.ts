import { Field, ID, InputType } from '@nestjs/graphql';
import { ArrayMinSize, IsString, Length } from 'class-validator';

@InputType()
export class CreateChatGroupInput {
  @Field()
  @IsString()
  @Length(2, 80)
  name!: string;

  @Field(() => [ID])
  @ArrayMinSize(1)
  memberIds!: string[];
}
