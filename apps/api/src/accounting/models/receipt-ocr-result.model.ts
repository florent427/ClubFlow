import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ReceiptOcrResultGraph {
  /** ID de l'extraction persisée (utile pour audit / debug). */
  @Field(() => ID, { nullable: true })
  extractionId!: string | null;

  /** ID de l'AccountingEntry créée en NEEDS_REVIEW (null si échec total). */
  @Field(() => ID, { nullable: true })
  entryId!: string | null;

  /**
   * Si non null : un fichier avec même SHA-256 existe déjà, l'entry qu'il
   * a créé. L'UI affiche une alerte "doublon probable".
   */
  @Field(() => ID, { nullable: true })
  duplicateOfEntryId!: string | null;

  /** Vrai si budget IA mensuel atteint → saisie manuelle requise. */
  @Field()
  budgetBlocked!: boolean;
}
