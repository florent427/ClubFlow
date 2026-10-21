import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MileageClaimStatus, type Club } from '@prisma/client';
import { CurrentClub } from '../../common/decorators/current-club.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireClubModule } from '../../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../../common/guards/gql-jwt-auth.guard';
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
  TaxReceiptPendingDonorGraph,
  TaxReceiptSettingsGraph,
  TaxReceiptSettingsInputGraph,
  claimInput,
  recurringInput,
  settingsInput,
  toClaimGraph,
  toPendingDonorGraph,
  toRecurringGraph,
  toSettingsGraph,
  toTaxReceiptGraph,
  toVehicleGraph,
  tripInput,
  vehicleInput,
} from './mileage.graph';
import { MileageService, type MileageActor } from './mileage.service';
import { TaxReceiptsService } from './tax-receipts.service';

/**
 * Frais kilométriques côté trésorier : revue des notes (valider, renvoyer,
 * refuser), saisie pour le compte d'un bénévole, reçus fiscaux.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class MileageResolver {
  constructor(
    private readonly mileage: MileageService,
    private readonly receipts: TaxReceiptsService,
  ) {}

  private admin(user: RequestUser): MileageActor {
    return { kind: 'admin', userId: user.userId };
  }

  // ── Notes ──

  @Query(() => [MileageClaimGraph], { name: 'clubMileageClaims' })
  async clubMileageClaims(
    @CurrentClub() club: Club,
    @Args('status', { type: () => MileageClaimStatus, nullable: true })
    status?: MileageClaimStatus | null,
    @Args('memberId', { type: () => ID, nullable: true }) memberId?: string | null,
  ): Promise<MileageClaimGraph[]> {
    const rows = await this.mileage.listClaims(club.id, { status, memberId });
    return rows.map(toClaimGraph);
  }

  @Query(() => MileageClaimGraph, { name: 'clubMileageClaim' })
  async clubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.getClaim(club.id, this.admin(user), id));
  }

  @Mutation(() => MileageClaimGraph, { name: 'createClubMileageClaim' })
  async createClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('input') input: MileageClaimInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(
      await this.mileage.createClaim(club.id, this.admin(user), memberId, claimInput(input)),
    );
  }

  @Mutation(() => MileageClaimGraph, { name: 'updateClubMileageClaim' })
  async updateClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageClaimInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(
      await this.mileage.updateClaim(club.id, this.admin(user), id, claimInput(input)),
    );
  }

  @Mutation(() => Boolean, { name: 'deleteClubMileageClaim' })
  async deleteClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.mileage.deleteClaim(club.id, this.admin(user), id);
    return true;
  }

  @Mutation(() => MileageClaimGraph, { name: 'addClubMileageTrip' })
  async addClubMileageTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('claimId', { type: () => ID }) claimId: string,
    @Args('input') input: MileageTripInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(
      await this.mileage.addTrip(club.id, this.admin(user), claimId, tripInput(input)),
    );
  }

  @Mutation(() => MileageClaimGraph, { name: 'updateClubMileageTrip' })
  async updateClubMileageTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageTripInputGraph,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(
      await this.mileage.updateTrip(club.id, this.admin(user), id, tripInput(input)),
    );
  }

  @Mutation(() => MileageClaimGraph, { name: 'deleteClubMileageTrip' })
  async deleteClubMileageTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.deleteTrip(club.id, this.admin(user), id));
  }

  @Mutation(() => MileageRecurringFillGraph, { name: 'addClubMileageRecurringTrips' })
  async addClubMileageRecurringTrips(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('claimId', { type: () => ID }) claimId: string,
    @Args('from') from: string,
    @Args('to') to: string,
  ): Promise<MileageRecurringFillGraph> {
    const r = await this.mileage.addRecurringTrips(club.id, this.admin(user), claimId, {
      from: parseIsoDate(from),
      to: parseIsoDate(to),
    });
    return { claim: toClaimGraph(r.claim), added: r.added };
  }

  @Mutation(() => MileageClaimGraph, { name: 'submitClubMileageClaim' })
  async submitClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.submitClaim(club.id, this.admin(user), id));
  }

  @Mutation(() => MileageClaimGraph, { name: 'approveClubMileageClaim' })
  async approveClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.approveClaim(club.id, user.userId, id));
  }

  @Mutation(() => MileageClaimGraph, { name: 'returnClubMileageClaim' })
  async returnClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('comment') comment: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.returnClaim(club.id, user.userId, id, comment));
  }

  @Mutation(() => MileageClaimGraph, { name: 'rejectClubMileageClaim' })
  async rejectClubMileageClaim(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('comment') comment: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.rejectClaim(club.id, user.userId, id, comment));
  }

  @Mutation(() => MileageClaimGraph, { name: 'cancelClubMileageClaimApproval' })
  async cancelClubMileageClaimApproval(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MileageClaimGraph> {
    return toClaimGraph(await this.mileage.cancelApproval(club.id, user.userId, id));
  }

  // ── Véhicules ──

  @Query(() => [MileageVehicleGraph], { name: 'clubMileageVehicles' })
  async clubMileageVehicles(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID, nullable: true }) memberId?: string | null,
    @Args('includeArchived', { type: () => Boolean, nullable: true })
    includeArchived?: boolean | null,
  ): Promise<MileageVehicleGraph[]> {
    const rows = await this.mileage.listVehicles(club.id, memberId ?? null, !!includeArchived);
    return rows.map(toVehicleGraph);
  }

  @Mutation(() => MileageVehicleGraph, { name: 'createClubMileageVehicle' })
  async createClubMileageVehicle(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('input') input: MileageVehicleInputGraph,
  ): Promise<MileageVehicleGraph> {
    return toVehicleGraph(await this.mileage.createVehicle(club.id, memberId, vehicleInput(input)));
  }

  @Mutation(() => MileageVehicleGraph, { name: 'updateClubMileageVehicle' })
  async updateClubMileageVehicle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageVehicleInputGraph,
  ): Promise<MileageVehicleGraph> {
    return toVehicleGraph(
      await this.mileage.updateVehicle(club.id, this.admin(user), id, vehicleInput(input)),
    );
  }

  @Mutation(() => MileageVehicleGraph, { name: 'setClubMileageVehicleArchived' })
  async setClubMileageVehicleArchived(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('archived') archived: boolean,
  ): Promise<MileageVehicleGraph> {
    return toVehicleGraph(
      await this.mileage.setVehicleArchived(club.id, this.admin(user), id, archived),
    );
  }

  @Mutation(() => Boolean, { name: 'deleteClubMileageVehicle' })
  async deleteClubMileageVehicle(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.mileage.deleteVehicle(club.id, this.admin(user), id);
    return true;
  }

  // ── Trajets récurrents ──

  @Query(() => [MileageRecurringTripGraph], { name: 'clubMileageRecurringTrips' })
  async clubMileageRecurringTrips(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID, nullable: true }) memberId?: string | null,
    @Args('includeArchived', { type: () => Boolean, nullable: true })
    includeArchived?: boolean | null,
  ): Promise<MileageRecurringTripGraph[]> {
    const rows = await this.mileage.listRecurringTrips(
      club.id,
      memberId ?? null,
      !!includeArchived,
    );
    return rows.map(toRecurringGraph);
  }

  @Mutation(() => MileageRecurringTripGraph, { name: 'createClubMileageRecurringTrip' })
  async createClubMileageRecurringTrip(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('input') input: MileageRecurringTripInputGraph,
  ): Promise<MileageRecurringTripGraph> {
    return toRecurringGraph(
      await this.mileage.createRecurringTrip(club.id, memberId, recurringInput(input)),
    );
  }

  @Mutation(() => MileageRecurringTripGraph, { name: 'updateClubMileageRecurringTrip' })
  async updateClubMileageRecurringTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: MileageRecurringTripInputGraph,
  ): Promise<MileageRecurringTripGraph> {
    return toRecurringGraph(
      await this.mileage.updateRecurringTrip(club.id, this.admin(user), id, recurringInput(input)),
    );
  }

  @Mutation(() => MileageRecurringTripGraph, { name: 'setClubMileageRecurringTripArchived' })
  async setClubMileageRecurringTripArchived(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('archived') archived: boolean,
  ): Promise<MileageRecurringTripGraph> {
    return toRecurringGraph(
      await this.mileage.setRecurringTripArchived(club.id, this.admin(user), id, archived),
    );
  }

  @Mutation(() => Boolean, { name: 'deleteClubMileageRecurringTrip' })
  async deleteClubMileageRecurringTrip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.mileage.deleteRecurringTrip(club.id, this.admin(user), id);
    return true;
  }

  // ── Reçus fiscaux ──

  @Query(() => TaxReceiptSettingsGraph, { name: 'clubTaxReceiptSettings' })
  async clubTaxReceiptSettings(@CurrentClub() club: Club): Promise<TaxReceiptSettingsGraph> {
    return toSettingsGraph(await this.receipts.getSettings(club.id));
  }

  @Mutation(() => TaxReceiptSettingsGraph, { name: 'updateClubTaxReceiptSettings' })
  async updateClubTaxReceiptSettings(
    @CurrentClub() club: Club,
    @Args('input') input: TaxReceiptSettingsInputGraph,
  ): Promise<TaxReceiptSettingsGraph> {
    return toSettingsGraph(await this.receipts.updateSettings(club.id, settingsInput(input)));
  }

  @Query(() => [TaxReceiptPendingDonorGraph], { name: 'clubTaxReceiptPendingDonors' })
  async clubTaxReceiptPendingDonors(
    @CurrentClub() club: Club,
    @Args('year', { type: () => Int }) year: number,
  ): Promise<TaxReceiptPendingDonorGraph[]> {
    return (await this.receipts.pendingDonors(club.id, year)).map(toPendingDonorGraph);
  }

  @Query(() => [TaxReceiptGraph], { name: 'clubTaxReceipts' })
  async clubTaxReceipts(
    @CurrentClub() club: Club,
    @Args('year', { type: () => Int, nullable: true }) year?: number | null,
  ): Promise<TaxReceiptGraph[]> {
    return (await this.receipts.list(club.id, { year })).map(toTaxReceiptGraph);
  }

  @Mutation(() => [TaxReceiptGraph], { name: 'issueClubTaxReceipts' })
  async issueClubTaxReceipts(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('year', { type: () => Int }) year: number,
    @Args('memberIds', { type: () => [ID] }) memberIds: string[],
  ): Promise<TaxReceiptGraph[]> {
    return (await this.receipts.issue(club.id, user.userId, year, memberIds)).map(
      toTaxReceiptGraph,
    );
  }

  @Mutation(() => TaxReceiptGraph, { name: 'cancelClubTaxReceipt' })
  async cancelClubTaxReceipt(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ): Promise<TaxReceiptGraph> {
    return toTaxReceiptGraph(await this.receipts.cancel(club.id, user.userId, id, reason));
  }

  @Query(() => String, { name: 'clubTaxReceiptPdf', description: 'PDF du reçu, en base64.' })
  async clubTaxReceiptPdf(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<string> {
    return this.receipts.pdfBase64(club.id, id, null);
  }
}
