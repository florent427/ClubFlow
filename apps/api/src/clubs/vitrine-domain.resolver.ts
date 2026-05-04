import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ClubsService } from './clubs.service';
import { SetVitrineDomainInput } from './dto/set-vitrine-domain.input';
import { VitrineDomainStateGql } from './models/vitrine-domain.model';

/**
 * Resolver dédié aux opérations de configuration du domaine custom vitrine
 * d'un club. Toutes les mutations sont CLUB_ADMIN-only et scopées au club
 * courant via le header `X-Club-Id` (ClubContextGuard).
 *
 * Cf. ADR-0007 (Caddy admin API) pour l'architecture sous-jacente.
 */
@Resolver(() => VitrineDomainStateGql)
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard)
export class VitrineDomainResolver {
  constructor(private readonly clubs: ClubsService) {}

  /**
   * Lit l'état actuel du domaine custom du club + IPs attendues
   * pour afficher dans la page admin "Paramètres → Domaine vitrine".
   */
  @Query(() => VitrineDomainStateGql)
  vitrineDomainState(@CurrentClub() club: Club): Promise<VitrineDomainStateGql> {
    return this.clubs.getVitrineDomainState(club.id);
  }

  /**
   * Déclare un nouveau domaine custom (ex. monclub.fr).
   * → status devient PENDING_DNS, le club doit ensuite ajouter les records
   * DNS chez son registrar puis appeler `verifyVitrineDomain`.
   */
  @Mutation(() => VitrineDomainStateGql)
  requestVitrineDomain(
    @CurrentClub() club: Club,
    @Args('input') input: SetVitrineDomainInput,
  ): Promise<VitrineDomainStateGql> {
    return this.clubs.requestVitrineDomain(club.id, input.domain);
  }

  /**
   * Vérifie le DNS du domaine custom et ajoute le vhost Caddy si OK.
   * → status devient ACTIVE (cert TLS Let's Encrypt obtenu en arrière-plan).
   */
  @Mutation(() => VitrineDomainStateGql)
  verifyVitrineDomain(@CurrentClub() club: Club): Promise<VitrineDomainStateGql> {
    return this.clubs.verifyVitrineDomain(club.id);
  }

  /**
   * Retire le domaine custom (remove vhost Caddy + clear DB).
   * Le club continue d'utiliser le sous-domaine fallback.
   */
  @Mutation(() => VitrineDomainStateGql)
  removeVitrineDomain(@CurrentClub() club: Club): Promise<VitrineDomainStateGql> {
    return this.clubs.removeVitrineDomain(club.id);
  }
}
