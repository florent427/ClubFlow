import { UseGuards } from '@nestjs/common';
import { Field, Int, Mutation, ObjectType, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';

/** Compte-rendu d'un passage du moteur de prélèvement. */
@ObjectType()
export class PaymentScheduleRunReportGraph {
  @Field(() => Int, { description: 'Échéances exigibles examinées.' })
  examined!: number;

  @Field(() => Int, { description: 'Prélèvements acceptés par Stripe.' })
  charged!: number;

  @Field(() => Int, { description: 'Prélèvements refusés.' })
  failed!: number;

  @Field(() => Int, { description: 'En attente d’authentification 3-D Secure.' })
  requiresAction!: number;

  @Field(() => Int, {
    description: 'Ignorées (déjà prises par un autre passage, ou incomplètes).',
  })
  skipped!: number;
}

/**
 * Déclenchement manuel du moteur de prélèvement (ADR-0009, lot 3).
 *
 * Le moteur tourne tout seul une fois par jour. Cette mutation existe pour
 * deux raisons concrètes : pouvoir **tester** sans attendre l'heure du cron,
 * et permettre au trésorier de **rejouer** un passage après avoir corrigé
 * une situation (moyen de paiement remis à jour, par exemple).
 *
 * Sans danger de double débit : la réservation atomique et la clé
 * d'idempotence par tentative protègent le rejeu.
 *
 * Réservé au back-office — déclencher des prélèvements n'est jamais une
 * action d'adhérent.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class PaymentScheduleAdminResolver {
  constructor(private readonly engine: PaymentScheduleEngineService) {}

  @Mutation(() => PaymentScheduleRunReportGraph, {
    name: 'triggerPaymentScheduleRun',
    description:
      'Prélève immédiatement les échéances exigibles du club. Idempotent : une échéance déjà prise ou déjà payée est ignorée.',
  })
  async triggerPaymentScheduleRun(
    @CurrentClub() club: Club,
  ): Promise<PaymentScheduleRunReportGraph> {
    // Scopé au club appelant : un admin ne déclenche jamais les prélèvements
    // d'un autre tenant.
    return this.engine.runDue({ clubId: club.id });
  }
}
