import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * Preview de l'audience d'une campagne en cours d'édition. Sert à
 * afficher en temps réel « N destinataires (Léa, Théo, Marc, +149) »
 * quand l'admin construit le filtre côté UI.
 */
@ObjectType()
export class AudiencePreviewGraph {
  /** Nombre total de membres ACTIFS qui matchent le filtre. */
  @Field(() => Int)
  count!: number;

  /**
   * Échantillon (max 5) des noms complets pour preview UI.
   * Format : "Prénom Nom".
   */
  @Field(() => [String])
  sampleNames!: string[];
}
