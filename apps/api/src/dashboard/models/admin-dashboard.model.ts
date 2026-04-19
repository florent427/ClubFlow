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

  @Field(() => Int, {
    description: 'Membres dont createdAt tombe dans le mois courant UTC',
  })
  newMembersThisMonthCount!: number;

  @Field(() => Int, {
    description: 'Événements publiés avec début dans le futur',
  })
  upcomingEventsCount!: number;

  @Field(() => Int, {
    description: 'Annonces publiées dans les 30 derniers jours',
  })
  recentAnnouncementsCount!: number;

  @Field(() => Int, {
    description: 'Commandes boutique en attente de paiement',
  })
  pendingShopOrdersCount!: number;

  @Field(() => Int, {
    description: 'Dossiers de subvention DRAFT ou SUBMITTED',
  })
  openGrantApplicationsCount!: number;

  @Field(() => Int, {
    description: 'Contrats de sponsoring ACTIVE',
  })
  activeSponsorshipDealsCount!: number;

  @Field(() => Int, {
    description: 'Solde comptable courant (recettes - dépenses, centimes)',
  })
  accountingBalanceCents!: number;
}
