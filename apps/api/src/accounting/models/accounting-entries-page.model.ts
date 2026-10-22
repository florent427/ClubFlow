import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AccountingEntryGraph } from './accounting-entry.model';

/**
 * Une page de la liste des écritures : les plus récentes qui passent le
 * filtre, et combien le passent en tout. Sans ce total, l'écran ne peut pas
 * savoir qu'il lui manque des écritures (constaté en prod le 2026-10-22 :
 * la liste plafonnait à 200 sans le dire).
 */
@ObjectType()
export class AccountingEntriesPageGraph {
  @Field(() => [AccountingEntryGraph])
  items!: AccountingEntryGraph[];

  @Field(() => Int)
  totalCount!: number;
}
