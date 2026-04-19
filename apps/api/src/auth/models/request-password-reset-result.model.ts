import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class RequestPasswordResetResult {
  @Field({ description: 'Toujours true en cas de succès HTTP (anti-énumération).' })
  ok!: boolean;
}
