import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Agrégations admin alignées dashboard Stitch' })
export class AdminDashboardSummary {
  @Field(() => Int)
  activeMembersCount!: number;

  @Field(() => Int)
  activeModulesCount!: number;

  @Field(() => Int, {
    description: 'Créneaux cours avec début >= maintenant (module Planning)',
  })
  upcomingSessionsCount!: number;

  @Field(() => Int, {
    description: 'Nombre de factures au statut OPEN (module Paiement)',
  })
  outstandingPaymentsCount!: number;

  @Field(() => Int, {
    description: 'Somme des encaissements du mois civil UTC (centimes)',
  })
  revenueCentsMonth!: number;
}
