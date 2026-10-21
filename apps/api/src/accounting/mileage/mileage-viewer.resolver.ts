import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../../common/decorators/current-club.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireClubModule } from '../../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../../common/types/request-user';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import { parseIsoDate } from '../accounting-fiscal-year.service';
import {
  MileageClaimGraph,
  MileageClaimInputGraph,
  MileageRecurringFillGraph,
  MileageRecurringTripGraph,
  MileageRecurringTripInputGraph,
  MileageTripInputGraph,
  MileageVehicleGraph,
  MileageVehicleInputGraph,
  TaxReceiptGraph,
  claimInput,
  recurringInput,
  toClaimGraph,
  toRecurringGraph,
  toTaxReceiptGraph,
  toVehicleGraph,
  tripInput,
  vehicleInput,
} from './mileage.graph';
import { MileageService, type MileageActor } from './mileage.service';
import { TaxReceiptsService } from './tax-receipts.service';

/**
 * Frais kilométriques côté bénévole (portail) : ses véhicules, ses trajets
 * récurrents, ses notes et ses reçus fiscaux — jamais ceux d'un autre. Le
 * profil actif doit être une fiche adhérent : un contact n'a pas de note.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ViewerActiveProfileGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class MileageViewerResolver {
  constructor(
    private readonly mileage: MileageService,
    private readonly receipts: TaxReceiptsService,
  ) {}

  private me(user: RequestUser): MileageActor & { kind: 'member' } {
    if (!user.activeProfileMemberId) {
      throw new ForbiddenException('Les frais kilométriques se déclarent depuis un profil adhérent.');
    }
    return { kind: 'member', memberId: user.activeProfileMemberId, userId: user.userId };
  }

  @Query(() => Boolean, {
    name: 'viewerMileageDonationAvailable',
    description: 'Le club délivre des reçus fiscaux : l’abandon de frais est proposé.',
  })
  async viewerMileageDonationAvailable(@CurrentClub() club: Club): Promise<boolean> {
    return (await this.receipts.getSettings(club.id)).taxReceiptEnabled;
  }

  // ── Notes ──

  @Query(() => [MileageClaimGraph], { name: 'viewerMileageClaims' })
  async viewerMileageClaims(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<MileageClaimGraph[]> {
    const rows = await this.mileage.listClaims(club.id, { memberId: this.me(user).memberId });
    return rows.map(toClaimGraph);
  }

  @Query(() => MileageClaimGraph, { name: 'viewerMileageClaim' })
  async viewerMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.getClaim(club.id, this.me(user), id));
  }

  @Mutation(() => MileageClaimGraph, { name: 'viewerCreateMileageClaim' })
  async viewerCreateMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: MileageClaimInputGraph,
  ): Promise<MileageClaimGraph> {
    const me = this.me(user);
    return toClaimGraph(await this.mileage.createClaim(club.id, me, me.memberId, claimInput(input)));
  }

  @Mutation(() => MileageClaimGraph, { name: 'viewerUpdateMileageClaim' })
  async viewerUpdateMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageClaimInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.updateClaim(club.id, this.me(user), id, claimInput(input)));
  }

  @Mutation(() => Boolean, { name: 'viewerDeleteMileageClaim' })
  async viewerDeleteMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.mileage.deleteClaim(club.id, this.me(user), id);
    return true;
  }

  @Mutation(() => MileageClaimGraph, { name: 'viewerAddMileageTrip' })
  async viewerAddMileageTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('claimId', { type: () => ID }) claimId: string,
    @Args('input') input: MileageTripInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.addTrip(club.id, this.me(user), claimId, tripInput(input)));
  }

  @Mutation(() => MileageClaimGraph, { name: 'viewerUpdateMileageTrip' })
  async viewerUpdateMileageTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageTripInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.updateTrip(club.id, this.me(user), id, tripInput(input)));
  }

  @Mutation(() => MileageClaimGraph, { name: 'viewerDeleteMileageTrip' })
  async viewerDeleteMileageTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.deleteTrip(club.id, this.me(user), id));
  }

  @Mutation(() => MileageRecurringFillGraph, { name: 'viewerAddMileageRecurringTrips' })
  async viewerAddMileageRecurringTrips(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('claimId', { type: () => ID }) claimId: string,
    @Args('from') from: string,
    @Args('to') to: string,
  ): Promise<MileageRecurringFillGraph> {
    const r = await this.mileage.addRecurringTrips(club.id, this.me(user), claimId, {
      from: parseIsoDate(from),
      to: parseIsoDate(to),
    });
    return { claim: toClaimGraph(r.claim), added: r.added };
  }

  @Mutation(() => MileageClaimGraph, { name: 'viewerSubmitMileageClaim' })
  async viewerSubmitMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.submitClaim(club.id, this.me(user), id));
  }

  // ── Véhicules ──

  @Query(() => [MileageVehicleGraph], { name: 'viewerMileageVehicles' })
  async viewerMileageVehicles(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('includeArchived', { type: () => Boolean, nullable: true })
    includeArchived?: boolean | null,
  ): Promise<MileageVehicleGraph[]> {
    const rows = await this.mileage.listVehicles(club.id, this.me(user).memberId, !!includeArchived);
    return rows.map(toVehicleGraph);
  }

  @Mutation(() => MileageVehicleGraph, { name: 'viewerCreateMileageVehicle' })
  async viewerCreateMileageVehicle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: MileageVehicleInputGraph,
  ): Promise<MileageVehicleGraph> {
    return toVehicleGraph(
      await this.mileage.createVehicle(club.id, this.me(user).memberId, vehicleInput(input)),
    );
  }

  @Mutation(() => MileageVehicleGraph, { name: 'viewerUpdateMileageVehicle' })
  async viewerUpdateMileageVehicle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageVehicleInputGraph,
  ): Promise<MileageVehicleGraph> {
    return toVehicleGraph(
      await this.mileage.updateVehicle(club.id, this.me(user), id, vehicleInput(input)),
    );
  }

  @Mutation(() => MileageVehicleGraph, { name: 'viewerSetMileageVehicleArchived' })
  async viewerSetMileageVehicleArchived(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('archived') archived: boolean,
  ): Promise<MileageVehicleGraph> {
    return toVehicleGraph(await this.mileage.setVehicleArchived(club.id, this.me(user), id, archived));
  }

  @Mutation(() => Boolean, { name: 'viewerDeleteMileageVehicle' })
  async viewerDeleteMileageVehicle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.mileage.deleteVehicle(club.id, this.me(user), id);
    return true;
  }

  // ── Trajets récurrents ──

  @Query(() => [MileageRecurringTripGraph], { name: 'viewerMileageRecurringTrips' })
  async viewerMileageRecurringTrips(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('includeArchived', { type: () => Boolean, nullable: true })
    includeArchived?: boolean | null,
  ): Promise<MileageRecurringTripGraph[]> {
    const rows = await this.mileage.listRecurringTrips(
      club.id,
      this.me(user).memberId,
      !!includeArchived,
    );
    return rows.map(toRecurringGraph);
  }

  @Mutation(() => MileageRecurringTripGraph, { name: 'viewerCreateMileageRecurringTrip' })
  async viewerCreateMileageRecurringTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: MileageRecurringTripInputGraph,
  ): Promise<MileageRecurringTripGraph> {
    return toRecurringGraph(
      await this.mileage.createRecurringTrip(club.id, this.me(user).memberId, recurringInput(input)),
    );
  }

  @Mutation(() => MileageRecurringTripGraph, { name: 'viewerUpdateMileageRecurringTrip' })
  async viewerUpdateMileageRecurringTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageRecurringTripInputGraph,
  ): Promise<MileageRecurringTripGraph> {
    return toRecurringGraph(
      await this.mileage.updateRecurringTrip(club.id, this.me(user), id, recurringInput(input)),
    );
  }

  @Mutation(() => MileageRecurringTripGraph, { name: 'viewerSetMileageRecurringTripArchived' })
  async viewerSetMileageRecurringTripArchived(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('archived') archived: boolean,
  ): Promise<MileageRecurringTripGraph> {
    return toRecurringGraph(
      await this.mileage.setRecurringTripArchived(club.id, this.me(user), id, archived),
    );
  }

  @Mutation(() => Boolean, { name: 'viewerDeleteMileageRecurringTrip' })
  async viewerDeleteMileageRecurringTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.mileage.deleteRecurringTrip(club.id, this.me(user), id);
    return true;
  }

  // ── Reçus fiscaux ──

  @Query(() => [TaxReceiptGraph], { name: 'viewerTaxReceipts' })
  async viewerTaxReceipts(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<TaxReceiptGraph[]> {
    const rows = await this.receipts.list(club.id, { memberId: this.me(user).memberId });
    return rows.filter((r) => r.status === 'ISSUED').map(toTaxReceiptGraph);
  }

  @Query(() => String, { name: 'viewerTaxReceiptPdf', description: 'PDF du reçu, en base64.' })
  async viewerTaxReceiptPdf(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<string> {
    return this.receipts.pdfBase64(club.id, id, this.me(user).memberId);
  }
}
