import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ResendVerificationResult {
  @Field()
  ok!: boolean;
}
