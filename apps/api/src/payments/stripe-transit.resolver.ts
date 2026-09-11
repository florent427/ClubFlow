import { UseGuards } from '@nestjs/common';
import { Field, GraphQLISODateTime, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { StripeTransitSyncService } from './stripe-transit-sync.service';

/** Ce qu'une vérification a trouvé. */
@ObjectType()
export class StripeTransitSyncReportGraph {
  @Field(() => String, { nullable: true, description: 'Renseigné quand il n’y avait rien à faire.' })
  skipped!: string | null;

  @Field(() => Int)
  payoutsSeen!: number;

  @Field(() => Int, { description: 'Virements dont l’écriture manquait.' })
  payoutsRecorded!: number;

  @Field(() => Int, { description: 'Transactions inconnues devenues des lignes à catégoriser.' })
  unknownLines!: number;

  @Field(() => Int, { description: 'Virements dont la somme des transactions ne tombe pas juste.' })
  arithmeticWarnings!: number;
}

/** De quoi afficher « vérifié le… » sans taper l'API Stripe. */
@ObjectType()
export class StripeTransitStatusGraph {
  @Field()
  hasStripeAccount!: boolean;

  @Field()
  hasTransitAccount!: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastSyncedAt!: Date | null;
}

/**
 * Vérification du transit Stripe par l'API (ADR-0014, lot 8).
 *
 * Le balayage tourne tous les jours à 04:30 ; cette mutation sert à ne pas
 * attendre demain quand on vient de faire un encaissement depuis le
 * dashboard Stripe.
 *
 * Gaté sur COMPTABILITÉ et non sur PAIEMENT : c'est un écran de trésorier.
 * Un club sans Stripe obtient simplement un rapport « sans compte Stripe ».
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class StripeTransitResolver {
  constructor(
    private readonly sync: StripeTransitSyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => StripeTransitStatusGraph, { name: 'stripeTransitStatus' })
  async stripeTransitStatus(@CurrentClub() club: Club): Promise<StripeTransitStatusGraph> {
    const transit = await this.prisma.clubFinancialAccount.findFirst({
      where: { clubId: club.id, kind: 'STRIPE_TRANSIT' },
      select: { stripeSyncedAt: true },
    });
    return {
      hasStripeAccount: !!club.stripeAccountId,
      hasTransitAccount: !!transit,
      lastSyncedAt: transit?.stripeSyncedAt ?? null,
    };
  }

  @Mutation(() => StripeTransitSyncReportGraph, {
    name: 'syncStripeTransit',
    description: 'Relit les virements Stripe depuis la dernière vérification.',
  })
  async syncStripeTransit(@CurrentClub() club: Club): Promise<StripeTransitSyncReportGraph> {
    const report = await this.sync.syncClub(club.id);
    return {
      skipped: report.skipped ?? null,
      payoutsSeen: report.payoutsSeen,
      payoutsRecorded: report.payoutsRecorded,
      unknownLines: report.unknownLines,
      arithmeticWarnings: report.arithmeticWarnings,
    };
  }
}
