import { Field, ObjectType } from '@nestjs/graphql';

/**
 * Résultat de la mutation publique `createClubAndAdmin`.
 *
 * Note : on ne renvoie ni le JWT ni les credentials de l'admin — il doit
 * vérifier son email puis se connecter explicitement (anti-énumération).
 */
@ObjectType()
export class CreateClubAndAdminResult {
  @Field({ description: 'Toujours true en cas de succès.' })
  ok!: boolean;

  @Field({ description: "ID UUID du club créé." })
  clubId!: string;

  @Field({ description: 'Slug définitif (peut différer de clubSlug si conflit / sanitization).' })
  clubSlug!: string;

  /**
   * URL fallback de la vitrine sur le sous-domaine ClubFlow, jusqu'à ce que
   * le club configure son domaine custom. Format `https://<slug>.clubflow.topdigital.re`.
   * Phase 2 : disponible quand le wildcard vhost est en place côté Caddy.
   */
  @Field({ description: 'URL fallback de la vitrine (sous-domaine clubflow.topdigital.re).' })
  vitrineFallbackUrl!: string;

  @Field({
    description:
      "true si le mail de vérification a été envoyé. false en mode dev sans SMTP configuré (le user peut alors se connecter direct).",
  })
  emailSent!: boolean;
}
