import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SendQuickMessageResult {
  @Field()
  success!: boolean;

  /**
   * Canal push : nombre d'appareils ayant accepté la notification. Le
   * message reste lisible dans le portail même à 0 ; null si le canal
   * n'était pas demandé.
   */
  @Field(() => Int, { nullable: true })
  pushDelivered!: number | null;
}
