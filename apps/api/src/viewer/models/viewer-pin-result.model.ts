import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Résultat des mutations PIN espace payeur.
 * - `ok: true` = action validée (set / clear / verify réussi)
 * - `ok: false` = PIN incorrect (mutation verify uniquement, on ne
 *   throw pas pour ne pas fuiter l'info via le code HTTP).
 */
@ObjectType('ViewerPayerSpacePinResult')
export class ViewerPayerSpacePinResultGraph {
  @Field(() => Boolean)
  ok!: boolean;
}
