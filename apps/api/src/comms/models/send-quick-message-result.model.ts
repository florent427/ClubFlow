import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SendQuickMessageResult {
  @Field()
  success!: boolean;
}
