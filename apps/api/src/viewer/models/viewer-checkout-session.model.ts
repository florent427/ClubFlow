import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('ViewerCheckoutSession')
export class ViewerCheckoutSessionGraph {
  @Field(() => String)
  url!: string;

  @Field(() => String)
  sessionId!: string;
}
