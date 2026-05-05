import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class RegisterContactResult {
  @Field({ description: 'Toujours true en cas de succès HTTP (anti-énumération).' })
  ok!: boolean;

  /**
   * `true` : un email de vérification a été envoyé, l'utilisateur doit
   *  cliquer le lien avant de pouvoir se logger.
   * `false` : compte créé directement sans vérification (cas multi-tenant
   *  où l'utilisateur a déjà vérifié son email sur un autre club). Le
   *  frontend peut alors rediriger vers /login directement.
   */
  @Field({ description: 'Indique si un email de vérification a été envoyé.' })
  requiresEmailVerification!: boolean;
}
