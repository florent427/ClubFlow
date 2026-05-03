import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import {
  GrantApplicationStatus,
  GrantDocumentKind,
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
import { CreateGrantApplicationInput } from './dto/create-grant-application.input';
import {
  CreateGrantInstallmentInput,
  MarkGrantGrantedInput,
  MarkGrantInstallmentReceivedInput,
  UpdateGrantApplicationInput,
} from './dto/update-grant-application.input';
import { GrantsService } from './grants.service';
import {
  GrantApplicationGraph,
  GrantDocumentGraph,
  GrantInstallmentGraph,
} from './models/grant-application.model';

interface RowWithRelations {
  id: string;
  title: string;
  fundingBody: string | null;
  status: GrantApplicationStatus;
  requestedAmountCents: number | null;
  grantedAmountCents: number | null;
  amountCents: number | null;
  projectId: string | null;
  project?: { id: string; title: string } | null;
  startsAt: Date | null;
  endsAt: Date | null;
  reportDueAt: Date | null;
  reportSubmittedAt: Date | null;
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
    notes: string | null;
    createdAt: Date;
  }>;
  documents: Array<{
    id: string;
    mediaAssetId: string;
    kind: GrantDocumentKind;
    mediaAsset: { fileName: string; publicUrl: string; mimeType: string };
  }>;
}

function toGraph(row: RowWithRelations): GrantApplicationGraph {
  return {
    id: row.id,
    title: row.title,
    fundingBody: row.fundingBody,
    status: row.status,
    requestedAmountCents: row.requestedAmountCents,
    grantedAmountCents: row.grantedAmountCents,
    amountCents: row.amountCents,
    projectId: row.projectId,
    projectTitle: row.project?.title ?? null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reportDueAt: row.reportDueAt,
    reportSubmittedAt: row.reportSubmittedAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    installments: row.installments.map(
      (i): GrantInstallmentGraph => ({
        id: i.id,
        expectedAmountCents: i.expectedAmountCents,
        receivedAmountCents: i.receivedAmountCents,
        expectedAt: i.expectedAt,
        receivedAt: i.receivedAt,
        paymentId: i.paymentId,
        accountingEntryId: i.accountingEntryId,
        notes: i.notes,
        createdAt: i.createdAt,
      }),
    ),
    documents: row.documents.map(
      (d): GrantDocumentGraph => ({
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
@RequireClubModule(ModuleCode.SUBSIDIES)
export class SubsidiesResolver {
  constructor(private readonly grants: GrantsService) {}

  @Query(() => [GrantApplicationGraph], { name: 'clubGrantApplications' })
  async clubGrantApplications(
    @CurrentClub() club: Club,
    @Args('status', {
      type: () => GrantApplicationStatus,
      nullable: true,
    })
    status: GrantApplicationStatus | null,
  ): Promise<GrantApplicationGraph[]> {
    const rows = await this.grants.list(club.id, status ?? undefined);
    return (rows as unknown as RowWithRelations[]).map(toGraph);
  }

  @Query(() => GrantApplicationGraph, { name: 'clubGrantApplication' })
  async clubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    const row = await this.grants.getOne(club.id, id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async createClubGrantApplication(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateGrantApplicationInput,
  ): Promise<GrantApplicationGraph> {
    await this.grants.create(club.id, user.userId, {
      title: input.title,
      fundingBody: input.fundingBody ?? null,
      requestedAmountCents: input.requestedAmountCents ?? null,
      projectId: input.projectId ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      reportDueAt: input.reportDueAt ?? null,
      notes: input.notes ?? null,
    });
    // Retourne la version enrichie
    const rows = await this.grants.list(club.id);
    return toGraph((rows[0] ?? rows[rows.length - 1]) as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async updateClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateGrantApplicationInput,
  ): Promise<GrantApplicationGraph> {
    await this.grants.update(club.id, input.id, {
      title: input.title,
      fundingBody: input.fundingBody ?? undefined,
      requestedAmountCents: input.requestedAmountCents ?? undefined,
      grantedAmountCents: input.grantedAmountCents ?? undefined,
      projectId: input.projectId ?? undefined,
      startsAt: input.startsAt ?? undefined,
      endsAt: input.endsAt ?? undefined,
      reportDueAt: input.reportDueAt ?? undefined,
      notes: input.notes ?? undefined,
    });
    const row = await this.grants.getOne(club.id, input.id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async submitClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    await this.grants.submit(club.id, id);
    const row = await this.grants.getOne(club.id, id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async markClubGrantGranted(
    @CurrentClub() club: Club,
    @Args('input') input: MarkGrantGrantedInput,
  ): Promise<GrantApplicationGraph> {
    await this.grants.markGranted(club.id, input.id, input.grantedAmountCents);
    const row = await this.grants.getOne(club.id, input.id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async rejectClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    await this.grants.reject(club.id, id);
    const row = await this.grants.getOne(club.id, id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async markClubGrantReported(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    await this.grants.markReported(club.id, id);
    const row = await this.grants.getOne(club.id, id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async settleClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    await this.grants.settle(club.id, id);
    const row = await this.grants.getOne(club.id, id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => GrantApplicationGraph)
  async archiveClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<GrantApplicationGraph> {
    await this.grants.archive(club.id, id);
    const row = await this.grants.getOne(club.id, id);
    return toGraph(row as unknown as RowWithRelations);
  }

  @Mutation(() => Boolean)
  async deleteClubGrantApplication(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.grants.delete(club.id, id);
  }

  // --- Installments ---

  @Mutation(() => GrantInstallmentGraph)
  async createClubGrantInstallment(
    @CurrentClub() club: Club,
    @Args('input') input: CreateGrantInstallmentInput,
  ): Promise<GrantInstallmentGraph> {
    const i = await this.grants.addInstallment(club.id, input.grantId, {
      expectedAmountCents: input.expectedAmountCents,
      expectedAt: input.expectedAt ?? null,
      notes: input.notes ?? null,
    });
    return {
      id: i.id,
      expectedAmountCents: i.expectedAmountCents,
      receivedAmountCents: i.receivedAmountCents,
      expectedAt: i.expectedAt,
      receivedAt: i.receivedAt,
      paymentId: i.paymentId,
      accountingEntryId: i.accountingEntryId,
      notes: i.notes,
      createdAt: i.createdAt,
    };
  }

  @Mutation(() => GrantInstallmentGraph)
  async markClubGrantInstallmentReceived(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: MarkGrantInstallmentReceivedInput,
  ): Promise<GrantInstallmentGraph> {
    const i = await this.grants.markInstallmentReceived(
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
      notes: i.notes,
      createdAt: i.createdAt,
    };
  }

  @Mutation(() => Boolean)
  async deleteClubGrantInstallment(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.grants.removeInstallment(club.id, id);
  }

  // --- Documents ---

  @Mutation(() => Boolean)
  async attachClubGrantDocument(
    @CurrentClub() club: Club,
    @Args('grantId', { type: () => ID }) grantId: string,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
    @Args('kind', { type: () => GrantDocumentKind, nullable: true })
    kind: GrantDocumentKind | null,
  ): Promise<boolean> {
    await this.grants.attachDocument(
      club.id,
      grantId,
      mediaAssetId,
      kind ?? GrantDocumentKind.OTHER,
    );
    return true;
  }

  @Mutation(() => Boolean)
  async detachClubGrantDocument(
    @CurrentClub() club: Club,
    @Args('documentId', { type: () => ID }) documentId: string,
  ): Promise<boolean> {
    return this.grants.detachDocument(club.id, documentId);
  }
}
