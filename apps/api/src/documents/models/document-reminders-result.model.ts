import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * Résultat agrégé de l'envoi de relances de signature aux membres
 * concernés (déclenchement manuel admin via mutation).
 */
@ObjectType()
export class DocumentRemindersResultGraph {
  @Field(() => Int)
  sent!: number;

  @Field(() => Int)
  failed!: number;
}
