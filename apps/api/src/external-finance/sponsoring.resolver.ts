import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import {
  SponsorshipDealStatus,
  SponsorshipDocumentKind,
  SponsorshipKind,
} from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ModuleCode } from '../domain/module-registry/module-codes';
import type { RequestUser } from '../common/types/request-user';
import { CreateSponsorshipDealInput } from './dto/create-sponsorship-deal.input';
import {
  CreateSponsorshipInstallmentInput,
  MarkSponsorshipInstallmentReceivedInput,
  UpdateSponsorshipDealInput,
} from './dto/update-sponsorship-deal.input';
import {
  SponsorshipDealGraph,
  SponsorshipDocumentGraph,
  SponsorshipInstallmentGraph,
} from './models/sponsorship-deal.model';
import { SponsoringService } from './sponsoring.service';

interface DealRow {
  id: string;
  sponsorName: string;
  kind: SponsorshipKind;
  status: SponsorshipDealStatus;
  valueCents: number | null;
  amountCents: number | null;
  inKindDescription: string | null;
  projectId: string | null;
  project?: { id: string; title: string } | null;
  contactId: string | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  startsAt: Date | null;
  endsAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  installments: Array<{
    id: string;
    expectedAmountCents: number;
    receivedAmountCents: number | null;
    expectedAt: Date | null;
    receivedAt: Date | null;
    paymentId: string | null;
    accountingEntryId: string | null;
    createdAt: Date;
  }>;
  documents: Array<{
    id: string;
    mediaAssetId: string;
    kind: SponsorshipDocumentKind;
    mediaAsset: { fileName: string; publicUrl: string; mimeType: string };
  }>;
}

function toGraph(row: DealRow): SponsorshipDealGraph {
  return {
    id: row.id,
    sponsorName: row.sponsorName,
    kind: row.kind,
    status: row.status,
    valueCents: row.valueCents,
    amountCents: row.amountCents,
    inKindDescription: row.inKindDescription,
    projectId: row.projectId,
    projectTitle: row.project?.title ?? null,
    contactId: row.contactId,
    contactName: row.contact
      ? `${row.contact.firstName} ${row.contact.lastName}`
      : null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    installments: row.installments.map(
      (i): SponsorshipInstallmentGraph => ({
        id: i.id,
        expectedAmountCents: i.expectedAmountCents,
        receivedAmountCents: i.receivedAmountCents,
        expectedAt: i.expectedAt,
        receivedAt: i.receivedAt,
        paymentId: i.paymentId,
        accountingEntryId: i.accountingEntryId,
        createdAt: i.createdAt,
      }),
    ),
    documents: row.documents.map(
      (d): SponsorshipDocumentGraph => ({
        id: d.id,
        mediaAssetId: d.mediaAssetId,
        kind: d.kind,
        fileName: d.mediaAsset.fileName,
        publicUrl: d.mediaAsset.publicUrl,
        mimeType: d.mediaAsset.mimeType,
      }),
    ),
  };
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.SPONSORING)
export class SponsoringResolver {
  constructor(private readonly sponsoring: SponsoringService) {}

  @Query(() => [SponsorshipDealGraph], { name: 'clubSponsorshipDeals' })
  async clubSponsorshipDeals(
    @CurrentClub() club: Club,
    @Args('status', {
      type: () => SponsorshipDealStatus,
      nullable: true,
    })
    status: SponsorshipDealStatus | null,
  ): Promise<SponsorshipDealGraph[]> {
    const rows = await this.sponsoring.list(club.id, status ?? undefined);
    return (rows as unknown as DealRow[]).map(toGraph);
  }

  @Query(() => SponsorshipDealGraph, { name: 'clubSponsorshipDeal' })
  async clubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SponsorshipDealGraph> {
    const row = await this.sponsoring.getOne(club.id, id);
    return toGraph(row as unknown as DealRow);
  }

  @Mutation(() => SponsorshipDealGraph)
  async createClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateSponsorshipDealInput,
  ): Promise<SponsorshipDealGraph> {
    const created = await this.sponsoring.create(club.id, user.userId, {
      sponsorName: input.sponsorName,
      kind: input.kind,
      valueCents: input.valueCents ?? null,
      inKindDescription: input.inKindDescription ?? null,
      projectId: input.projectId ?? null,
      contactId: input.contactId ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      notes: input.notes ?? null,
    });
    const row = await this.sponsoring.getOne(club.id, created.id);
    return toGraph(row as unknown as DealRow);
  }

  @Mutation(() => SponsorshipDealGraph)
  async updateClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateSponsorshipDealInput,
  ): Promise<SponsorshipDealGraph> {
    await this.sponsoring.update(club.id, input.id, {
      sponsorName: input.sponsorName,
      valueCents: input.valueCents ?? undefined,
      inKindDescription: input.inKindDescription ?? undefined,
      projectId: input.projectId ?? undefined,
      contactId: input.contactId ?? undefined,
      startsAt: input.startsAt ?? undefined,
      endsAt: input.endsAt ?? undefined,
      notes: input.notes ?? undefined,
    });
    const row = await this.sponsoring.getOne(club.id, input.id);
    return toGraph(row as unknown as DealRow);
  }

  @Mutation(() => SponsorshipDealGraph)
  async activateClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SponsorshipDealGraph> {
    await this.sponsoring.activate(club.id, user.userId, id);
    const row = await this.sponsoring.getOne(club.id, id);
    return toGraph(row as unknown as DealRow);
  }

  @Mutation(() => SponsorshipDealGraph)
  async closeClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SponsorshipDealGraph> {
    await this.sponsoring.close(club.id, id);
    const row = await this.sponsoring.getOne(club.id, id);
    return toGraph(row as unknown as DealRow);
  }

  @Mutation(() => SponsorshipDealGraph)
  async cancelClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SponsorshipDealGraph> {
    await this.sponsoring.cancel(club.id, id);
    const row = await this.sponsoring.getOne(club.id, id);
    return toGraph(row as unknown as DealRow);
  }

  @Mutation(() => Boolean)
  async deleteClubSponsorshipDeal(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.sponsoring.delete(club.id, id);
  }

  // --- Installments ---

  @Mutation(() => SponsorshipInstallmentGraph)
  async createClubSponsorshipInstallment(
    @CurrentClub() club: Club,
    @Args('input') input: CreateSponsorshipInstallmentInput,
  ): Promise<SponsorshipInstallmentGraph> {
    const i = await this.sponsoring.addInstallment(club.id, input.dealId, {
      expectedAmountCents: input.expectedAmountCents,
      expectedAt: input.expectedAt ?? null,
    });
    return {
      id: i.id,
      expectedAmountCents: i.expectedAmountCents,
      receivedAmountCents: i.receivedAmountCents,
      expectedAt: i.expectedAt,
      receivedAt: i.receivedAt,
      paymentId: i.paymentId,
      accountingEntryId: i.accountingEntryId,
      createdAt: i.createdAt,
    };
  }

  @Mutation(() => SponsorshipInstallmentGraph)
  async markClubSponsorshipInstallmentReceived(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: MarkSponsorshipInstallmentReceivedInput,
  ): Promise<SponsorshipInstallmentGraph> {
    const i = await this.sponsoring.markInstallmentReceived(
      club.id,
      user.userId,
      input.id,
      {
        receivedAmountCents: input.receivedAmountCents,
        receivedAt: input.receivedAt ?? null,
        paymentId: input.paymentId ?? null,
      },
    );
    return {
      id: i.id,
      expectedAmountCents: i.expectedAmountCents,
      receivedAmountCents: i.receivedAmountCents,
      expectedAt: i.expectedAt,
      receivedAt: i.receivedAt,
      paymentId: i.paymentId,
      accountingEntryId: i.accountingEntryId,
      createdAt: i.createdAt,
    };
  }

  @Mutation(() => Boolean)
  async deleteClubSponsorshipInstallment(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.sponsoring.removeInstallment(club.id, id);
  }

  // --- Documents ---

  @Mutation(() => Boolean)
  async attachClubSponsorshipDocument(
    @CurrentClub() club: Club,
    @Args('dealId', { type: () => ID }) dealId: string,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
    @Args('kind', { type: () => SponsorshipDocumentKind, nullable: true })
    kind: SponsorshipDocumentKind | null,
  ): Promise<boolean> {
    await this.sponsoring.attachDocument(
      club.id,
      dealId,
      mediaAssetId,
      kind ?? SponsorshipDocumentKind.OTHER,
    );
    return true;
  }

  @Mutation(() => Boolean)
  async detachClubSponsorshipDocument(
    @CurrentClub() club: Club,
    @Args('documentId', { type: () => ID }) documentId: string,
  ): Promise<boolean> {
    return this.sponsoring.detachDocument(club.id, documentId);
  }
}
