import { Field, ID, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayMinSize, IsUUID } from 'class-validator';

@InputType()
export class AddMembersToDynamicGroupInput {
  @Field(() => ID)
  @IsUUID('4')
  dynamicGroupId!: string;

  @Field(() => [ID])
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  memberIds!: string[];
}
