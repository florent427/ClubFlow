import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class EventConvocationResult {
  /** Nombre total de destinataires visés après résolution de l’audience. */
  @Field(() => Int)
  totalTargets!: number;

  /** Nombre d’e-mails effectivement envoyés via le transport. */
  @Field(() => Int)
  sent!: number;

  /** Nombre d’e-mails sautés (doublons déduits, adresses vides). */
  @Field(() => Int)
  skipped!: number;

  /** Nombre d’e-mails bloqués par la liste de suppression. */
  @Field(() => Int)
  suppressed!: number;

  /** Nombre d’erreurs remontées par le transport mail. */
  @Field(() => Int)
  failed!: number;
}
