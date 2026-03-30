import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Agrégations admin alignées dashboard Stitch' })
export class AdminDashboardSummary {
  @Field(() => Int)
  activeMembersCount!: number;

  @Field(() => Int)
  activeModulesCount!: number;

  @Field(() => Int, {
    description: 'Stub 0 jusqu’au module Planning',
  })
  upcomingSessionsCount!: number;

  @Field(() => Int, {
    description: 'Stub 0 jusqu’au module Paiement',
  })
  outstandingPaymentsCount!: number;

  @Field(() => Int, {
    description: 'Revenus mois en centimes — stub 0',
  })
  revenueCentsMonth!: number;
}
