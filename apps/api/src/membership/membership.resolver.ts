import { UnauthorizedException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import type { RequestUser } from '../common/types/request-user';
import { invoicePaymentTotals } from '../payments/invoice-totals';
import { InvoiceGraph } from '../payments/models/invoice.model';
import { CreateClubSeasonInput, UpdateClubSeasonInput } from './dto/create-club-season.input';
import {
  CreateMembershipInvoiceDraftInput,
  FinalizeMembershipInvoiceInput,
} from './dto/create-membership-invoice-draft.input';
import {
  CreateMembershipProductInput,
  UpdateMembershipProductInput,
} from './dto/create-membership-product.input';
import {
  CreateMembershipOneTimeFeeInput,
  UpdateMembershipOneTimeFeeInput,
} from './dto/membership-one-time-fee.input';
import { ClubSeasonGraph } from './models/club-season.model';
import type { MembershipProductGradeLevel } from '@prisma/client';
import { MembershipOneTimeFeeGraph } from './models/membership-one-time-fee.model';
import { MembershipProductGraph } from './models/membership-product.model';
import { MembershipService } from './membership.service';

type MembershipProductWithGrades = {
  id: string;
  clubId: string;
  label: string;
  annualAmountCents: number;
  monthlyAmountCents: number;
  minAge: number | null;
  maxAge: number | null;
  allowProrata: boolean;
  allowFamily: boolean;
  allowPublicAid: boolean;
  allowExceptional: boolean;
  exceptionalCapPercentBp: number | null;
  gradeFilters: MembershipProductGradeLevel[];
};

function toMembershipOneTimeFeeGraph(row: {
  id: string;
  clubId: string;
  label: string;
  amountCents: number;
}): MembershipOneTimeFeeGraph {
  return {
    id: row.id,
    clubId: row.clubId,
    label: row.label,
    amountCents: row.amountCents,
  };
}

function toMembershipProductGraph(
  r: MembershipProductWithGrades,
): MembershipProductGraph {
  return {
    id: r.id,
    clubId: r.clubId,
    label: r.label,
    annualAmountCents: r.annualAmountCents,
    monthlyAmountCents: r.monthlyAmountCents,
    minAge: r.minAge,
    maxAge: r.maxAge,
    gradeLevelIds: r.gradeFilters.map((g) => g.gradeLevelId),
    allowProrata: r.allowProrata,
    allowFamily: r.allowFamily,
    allowPublicAid: r.allowPublicAid,
    allowExceptional: r.allowExceptional,
    exceptionalCapPercentBp: r.exceptionalCapPercentBp,
  };
}

function toInvoiceGraph(row: {
  id: string;
  clubId: string;
  familyId: string | null;
  householdGroupId: string | null;
  clubSeasonId: string | null;
  label: string;
  baseAmountCents: number;
  amountCents: number;
  status: import('@prisma/client').InvoiceStatus;
  lockedPaymentMethod: import('@prisma/client').ClubPaymentMethod | null;
  dueAt: Date | null;
}): InvoiceGraph {
  const { totalPaidCents, balanceCents } = invoicePaymentTotals(
    row.amountCents,
    0,
  );
  return {
    id: row.id,
    clubId: row.clubId,
    familyId: row.familyId,
    householdGroupId: row.householdGroupId,
    clubSeasonId: row.clubSeasonId,
    label: row.label,
    baseAmountCents: row.baseAmountCents,
    amountCents: row.amountCents,
    status: row.status,
    lockedPaymentMethod: row.lockedPaymentMethod,
    dueAt: row.dueAt,
    totalPaidCents,
    balanceCents,
    familyLabel: null,
    householdGroupLabel: null,
    isCreditNote: false,
    parentInvoiceId: null,
    creditNoteReason: null,
  };
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class MembershipResolver {
  constructor(private readonly membership: MembershipService) {}

  @Query(() => [ClubSeasonGraph], { name: 'clubSeasons' })
  async clubSeasons(@CurrentClub() club: Club): Promise<ClubSeasonGraph[]> {
    const rows = await this.membership.listClubSeasons(club.id);
    return rows.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      label: r.label,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      isActive: r.isActive,
    }));
  }

  @Query(() => ClubSeasonGraph, { name: 'activeClubSeason', nullable: true })
  async activeClubSeason(
    @CurrentClub() club: Club,
  ): Promise<ClubSeasonGraph | null> {
    const r = await this.membership.getActiveClubSeason(club.id);
    if (!r) {
      return null;
    }
    return {
      id: r.id,
      clubId: r.clubId,
      label: r.label,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      isActive: r.isActive,
    };
  }

  @Mutation(() => ClubSeasonGraph)
  async createClubSeason(
    @CurrentClub() club: Club,
    @Args('input') input: CreateClubSeasonInput,
  ): Promise<ClubSeasonGraph> {
    const r = await this.membership.createClubSeason(club.id, input);
    return {
      id: r.id,
      clubId: r.clubId,
      label: r.label,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      isActive: r.isActive,
    };
  }

  @Mutation(() => ClubSeasonGraph)
  async updateClubSeason(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubSeasonInput,
  ): Promise<ClubSeasonGraph> {
    const r = await this.membership.updateClubSeason(club.id, input);
    return {
      id: r.id,
      clubId: r.clubId,
      label: r.label,
      startsOn: r.startsOn,
      endsOn: r.endsOn,
      isActive: r.isActive,
    };
  }

  @Query(() => [MembershipProductGraph], { name: 'membershipProducts' })
  async membershipProducts(
    @CurrentClub() club: Club,
  ): Promise<MembershipProductGraph[]> {
    const rows = await this.membership.listMembershipProducts(club.id);
    return rows.map((r) => toMembershipProductGraph(r));
  }

  @Query(() => [MembershipProductGraph], {
    name: 'eligibleMembershipProducts',
    description:
      'Formules cotisation pour lesquelles le membre remplit les critères (âge / grades).',
  })
  async eligibleMembershipProducts(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID }) memberId: string,
    @Args('referenceDate', { type: () => String, nullable: true })
    referenceDate?: string | null,
  ): Promise<MembershipProductGraph[]> {
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    const rows = await this.membership.eligibleMembershipProducts(
      club.id,
      memberId,
      ref,
    );
    return rows.map((r) => toMembershipProductGraph(r));
  }

  @Query(() => [MembershipOneTimeFeeGraph], {
    name: 'membershipOneTimeFees',
  })
  async membershipOneTimeFees(
    @CurrentClub() club: Club,
  ): Promise<MembershipOneTimeFeeGraph[]> {
    const rows = await this.membership.listMembershipOneTimeFees(club.id);
    return rows.map((r) => toMembershipOneTimeFeeGraph(r));
  }

  @Mutation(() => MembershipProductGraph)
  async createMembershipProduct(
    @CurrentClub() club: Club,
    @Args('input') input: CreateMembershipProductInput,
  ): Promise<MembershipProductGraph> {
    const r = await this.membership.createMembershipProduct(club.id, input);
    return toMembershipProductGraph(r);
  }

  @Mutation(() => MembershipProductGraph)
  async updateMembershipProduct(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMembershipProductInput,
  ): Promise<MembershipProductGraph> {
    const r = await this.membership.updateMembershipProduct(club.id, input);
    return toMembershipProductGraph(r);
  }

  @Mutation(() => Boolean)
  async deleteMembershipProduct(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.membership.deleteMembershipProduct(club.id, id);
    return true;
  }

  @Mutation(() => MembershipOneTimeFeeGraph)
  async createMembershipOneTimeFee(
    @CurrentClub() club: Club,
    @Args('input') input: CreateMembershipOneTimeFeeInput,
  ): Promise<MembershipOneTimeFeeGraph> {
    const r = await this.membership.createMembershipOneTimeFee(
      club.id,
      input,
    );
    return toMembershipOneTimeFeeGraph(r);
  }

  @Mutation(() => MembershipOneTimeFeeGraph)
  async updateMembershipOneTimeFee(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateMembershipOneTimeFeeInput,
  ): Promise<MembershipOneTimeFeeGraph> {
    const r = await this.membership.updateMembershipOneTimeFee(
      club.id,
      input,
    );
    return toMembershipOneTimeFeeGraph(r);
  }

  @Mutation(() => Boolean)
  async archiveMembershipOneTimeFee(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.membership.archiveMembershipOneTimeFee(club.id, id);
    return true;
  }

  @Mutation(() => Boolean)
  async deleteMembershipOneTimeFee(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    await this.membership.deleteMembershipOneTimeFee(club.id, id);
    return true;
  }

  @Mutation(() => InvoiceGraph)
  async createMembershipInvoiceDraft(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser | undefined,
    @Args('input') input: CreateMembershipInvoiceDraftInput,
  ): Promise<InvoiceGraph> {
    if (!user?.userId) {
      throw new UnauthorizedException();
    }
    const inv = await this.membership.createMembershipInvoiceDraft(
      club.id,
      user.userId,
      input,
    );
    return toInvoiceGraph(inv);
  }

  @Mutation(() => InvoiceGraph)
  async finalizeMembershipInvoice(
    @CurrentClub() club: Club,
    @Args('input') input: FinalizeMembershipInvoiceInput,
  ): Promise<InvoiceGraph> {
    const inv = await this.membership.finalizeMembershipInvoice(
      club.id,
      input.invoiceId,
      input.lockedPaymentMethod,
    );
    return toInvoiceGraph(inv);
  }
}
