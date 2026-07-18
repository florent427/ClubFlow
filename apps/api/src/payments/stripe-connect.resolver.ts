import { UseGuards } from '@nestjs/common';
import { Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { ClubStripeConnectStatusGraph } from './models/club-stripe-connect-status.model';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Configuration financière du club : branchement de son compte Stripe
 * Connect Express (ADR-0008).
 *
 * Strictement back-office — un membre ne doit jamais pouvoir déclencher un
 * onboarding ni ouvrir le dashboard Stripe du club. Même gating que
 * `PaymentsResolver` (module PAYMENT requis) : connecter Stripe n'a de sens
 * que si le club a souscrit au module de facturation.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class StripeConnectResolver {
  constructor(
    private readonly connect: StripeConnectService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Lit le miroir local uniquement : cette query est appelée à chaque
   * affichage de la page paramètres, on ne veut pas taper l'API Stripe
   * (latence + rate limit). Le miroir est tenu à jour par le webhook
   * `account.updated` et par `refreshStripeConnectStatus`.
   */
  @Query(() => ClubStripeConnectStatusGraph, {
    name: 'clubStripeConnectStatus',
  })
  clubStripeConnectStatus(
    @CurrentClub() club: Club,
  ): Promise<ClubStripeConnectStatusGraph> {
    return this.readStatus(club.id);
  }

  /**
   * Renvoie l'URL d'onboarding hébergé par Stripe. Le lien est éphémère et
   * à usage unique : c'est au client de l'ouvrir immédiatement, jamais de le
   * mettre en cache.
   */
  @Mutation(() => String)
  startStripeConnectOnboarding(@CurrentClub() club: Club): Promise<string> {
    return this.connect.createOnboardingLink(club.id);
  }

  /**
   * Force une resynchronisation depuis Stripe. Sert au retour d'onboarding,
   * quand le webhook `account.updated` n'est pas encore arrivé.
   */
  @Mutation(() => ClubStripeConnectStatusGraph)
  async refreshStripeConnectStatus(
    @CurrentClub() club: Club,
  ): Promise<ClubStripeConnectStatusGraph> {
    // Le service met à jour le miroir local au passage ; on relit ensuite en
    // base pour récupérer `stripeOnboardedAt`, qu'il ne renvoie pas.
    await this.connect.refreshAccountStatus(club.id);
    return this.readStatus(club.id);
  }

  /** URL de login vers le dashboard Express du club (paiements, virements). */
  @Mutation(() => String)
  openStripeConnectDashboard(@CurrentClub() club: Club): Promise<string> {
    return this.connect.createDashboardLink(club.id);
  }

  private async readStatus(
    clubId: string,
  ): Promise<ClubStripeConnectStatusGraph> {
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: {
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardedAt: true,
      },
    });
    return {
      stripeAccountId: club.stripeAccountId,
      chargesEnabled: club.stripeChargesEnabled,
      payoutsEnabled: club.stripePayoutsEnabled,
      detailsSubmitted: club.stripeDetailsSubmitted,
      onboardedAt: club.stripeOnboardedAt,
    };
  }
}
