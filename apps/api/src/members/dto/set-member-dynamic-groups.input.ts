import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class SetMemberDynamicGroupsInput {
  @Field(() => ID)
  @IsUUID('4')
  memberId!: string;

  @Field(() => [ID])
  @IsUUID('4', { each: true })
  dynamicGroupIds!: string[];
}
