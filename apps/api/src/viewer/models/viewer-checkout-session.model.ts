import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('ViewerCheckoutSession')
export class ViewerCheckoutSessionGraph {
  @Field(() => String)
  url!: string;

  @Field(() => String)
  sessionId!: string;

  /**
   * URL de succès réellement posée sur la session Stripe (`/facturation?paid=1`).
   *
   * Ce n'est PAS l'URL à ouvrir (`url`), c'est le PRÉFIXE que le mobile surveille
   * avec `WebBrowser.openAuthSessionAsync(url, paymentReturnUrl)` : le navigateur
   * intégré se ferme dès que Stripe y redirige, ce qui ramène DANS l'app au lieu
   * de laisser le membre sur le web déconnecté. Le web ignore ce champ.
   */
  @Field(() => String)
  paymentReturnUrl!: string;
}
