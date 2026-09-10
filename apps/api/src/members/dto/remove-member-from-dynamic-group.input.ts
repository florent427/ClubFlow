import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType()
export class RemoveMemberFromDynamicGroupInput {
  @Field(() => ID)
  @IsUUID('4')
  dynamicGroupId!: string;

  @Field(() => ID)
  @IsUUID('4')
  memberId!: string;
}
