import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DocumentSignatureStatsGraph {
  /** Nombre de membres ACTIVE éligibles (filtre minorsOnly inclus). */
  @Field(() => Int)
  totalRequired!: number;

  /** Nombre de signatures distinctes de la version courante non invalidées. */
  @Field(() => Int)
  totalSigned!: number;

  /** Pourcentage signés / requis (0-100). */
  @Field(() => Float)
  percentSigned!: number;

  /** Liste des memberIds éligibles n'ayant pas encore signé. */
  @Field(() => [ID])
  unsignedMemberIds!: string[];
}
