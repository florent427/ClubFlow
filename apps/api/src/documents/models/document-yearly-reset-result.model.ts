import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * Résultat du déclenchement (manuel ou cron) du reset annuel des
 * signatures sur les documents avec `resetAnnually=true`.
 */
@ObjectType()
export class DocumentYearlyResetResultGraph {
  /** Nombre de documents dont la version a été incrémentée. */
  @Field(() => Int)
  documentsReset!: number;

  /** Nombre de signatures invalidées (toutes versions, tous membres). */
  @Field(() => Int)
  signaturesInvalidated!: number;
}
