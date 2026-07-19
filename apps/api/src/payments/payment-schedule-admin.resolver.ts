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
import { SCHEDULER_LOCK_KEYS } from '../scheduling/scheduling.constants';
import { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import { StripeFeesService } from './stripe-fees.service';

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

/** Compte-rendu d'un balayage des frais Stripe. */
@ObjectType()
export class StripeFeesSweepReportGraph {
  @Field(() => Int, { description: 'Encaissements repris.' })
  examined!: number;

  @Field(() => Int, { description: 'Frais désormais connus.' })
  resolved!: number;

  @Field(() => Int, {
    description:
      'Encaissements trop anciens, non repris — à examiner manuellement.',
  })
  abandoned!: number;
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
  constructor(
    private readonly engine: PaymentScheduleEngineService,
    private readonly fees: StripeFeesService,
    private readonly lock: SchedulerLockService,
  ) {}

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

  @Mutation(() => StripeFeesSweepReportGraph, {
    name: 'triggerStripeFeesSweep',
    description:
      "Récupère immédiatement les frais Stripe des encaissements du club qui ne les connaissent pas encore. Le balayage horaire (à :15) fait ce travail ; cette mutation permet de ne pas l'attendre. Si un balayage est déjà en cours, renvoie un rapport vide plutôt que d'en lancer un second.",
  })
  async triggerStripeFeesSweep(
    @CurrentClub() club: Club,
  ): Promise<StripeFeesSweepReportGraph> {
    // Verrou PARTAGÉ avec le balayage horaire, et non une clé par club.
    //
    // Sans lui, deux exécutions concurrentes étaient triviales à provoquer —
    // un double-clic sur le bouton, ou un déclenchement tombant pendant le
    // passage de :15 — et toutes deux interrogeaient Stripe puis écrivaient
    // les mêmes frais. La contrainte `@@unique([clubId, paymentId, source])`
    // sur AccountingEntry empêche désormais la double écriture ; ce verrou
    // évite en amont les appels Stripe inutiles et la course elle-même.
    //
    // Scopé au club appelant : un admin ne provoque jamais d'appels Stripe
    // sur les comptes connectés d'autres tenants.
    const report = await this.lock.withLock(
      SCHEDULER_LOCK_KEYS.stripeFeesSweep,
      10 * 60_000,
      () => this.fees.sweepPendingFees({ clubId: club.id }),
    );
    // `withLock` renvoie null quand le bail est déjà tenu. Un rapport vide dit
    // la vérité — rien n'a été examiné par CET appel — sans faire échouer une
    // action d'administration dont le travail est de toute façon en cours.
    return report ?? { examined: 0, resolved: 0, abandoned: 0 };
  }
}
