import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class RegisterContactResult {
  @Field({ description: 'Toujours true en cas de succès HTTP (anti-énumération).' })
  ok!: boolean;

  /**
   * `true` : l'inscription attend un e-mail. C'est un lien de vérification
   *  ou, quand l'adresse a déjà un compte vérifié que le mot de passe n'a pas
   *  prouvé, un message au titulaire. Le client ne distingue pas les deux :
   *  c'est voulu (anti-énumération).
   * `false` : identité prouvée par le mot de passe d'un compte déjà vérifié,
   *  contact créé directement sur ce club. Le frontend peut rediriger vers
   *  /login.
   */
  @Field({ description: 'Indique si un email de vérification a été envoyé.' })
  requiresEmailVerification!: boolean;
}
