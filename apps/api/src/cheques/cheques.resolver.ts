import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { ChequeStatus } from '@prisma/client';
import {
  formatIsoDate,
  parseIsoDate,
} from '../accounting/accounting-fiscal-year.service';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { ChequeDepositsService } from './cheque-deposits.service';
import type { ChequeDepositRow } from './cheque-deposits.service';
import { ChequesService } from './cheques.service';
import type { ChequeRow } from './cheques.service';
import {
  CreateChequeDepositInput,
  CreateStandaloneChequeInput,
  UpdateChequeInput,
} from './dto/cheque.input';
import { ChequeDepositGraph, ChequeGraph } from './models/cheque.model';

export function toChequeGraph(row: ChequeRow): ChequeGraph {
  return {
    id: row.id,
    number: row.number,
    drawerName: row.drawerName,
    bankName: row.bankName,
    amountCents: row.amountCents,
    receivedOn: formatIsoDate(row.receivedOn),
    status: row.status,
    paymentId: row.paymentId,
    invoiceId: row.payment?.invoiceId ?? null,
    invoiceLabel: row.payment?.invoice.label ?? null,
    entryId: row.entryId,
    depositId: row.depositId,
    depositNumber: row.deposit?.number ?? null,
    imageAssetId: row.imageAssetId,
    imageUrl: row.image?.publicUrl ?? null,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export function toDepositGraph(row: ChequeDepositRow): ChequeDepositGraph {
  return {
    id: row.id,
    number: row.number,
    financialAccountId: row.financialAccountId,
    financialAccountLabel: row.financialAccount.label,
    depositedOn: formatIsoDate(row.depositedOn),
    totalCents: row.totalCents,
    chequeCount: row.chequeCount,
    status: row.status,
    entryId: row.entryId,
    slipAssetId: row.slipAssetId,
    slipUrl: row.slip?.publicUrl ?? null,
    notes: row.notes,
    createdAt: row.createdAt,
    cheques: row.cheques.map(toChequeGraph),
  };
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class ChequesResolver {
  constructor(
    private readonly cheques: ChequesService,
    private readonly deposits: ChequeDepositsService,
  ) {}

  @Query(() => [ChequeGraph], { name: 'clubCheques' })
  async clubCheques(
    @CurrentClub() club: Club,
    @Args('status', { type: () => ChequeStatus, nullable: true })
    status: ChequeStatus | null,
  ): Promise<ChequeGraph[]> {
    const rows = await this.cheques.list(club.id, status);
    return rows.map(toChequeGraph);
  }

  @Query(() => ChequeGraph, { name: 'clubCheque' })
  async clubCheque(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ChequeGraph> {
    return toChequeGraph(await this.cheques.getById(club.id, id));
  }

  @Query(() => [ChequeDepositGraph], { name: 'clubChequeDeposits' })
  async clubChequeDeposits(
    @CurrentClub() club: Club,
  ): Promise<ChequeDepositGraph[]> {
    const rows = await this.deposits.list(club.id);
    return rows.map(toDepositGraph);
  }

  @Query(() => ChequeDepositGraph, { name: 'clubChequeDeposit' })
  async clubChequeDeposit(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ChequeDepositGraph> {
    return toDepositGraph(await this.deposits.getById(club.id, id));
  }

  @Mutation(() => ChequeGraph, {
    name: 'createStandaloneCheque',
    description:
      'Chèque hors facture (sponsor, subvention, autre) : crée la recette avec 511200 en contrepartie et le chèque en portefeuille.',
  })
  async createStandaloneCheque(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateStandaloneChequeInput,
  ): Promise<ChequeGraph> {
    const row = await this.cheques.createStandalone(club.id, user.userId, {
      number: input.number ?? null,
      drawerName: input.drawerName,
      bankName: input.bankName ?? null,
      amountCents: input.amountCents,
      receivedOn: parseIsoDate(input.receivedOn),
      imageAssetId: input.imageAssetId ?? null,
      notes: input.notes ?? null,
      accountCode: input.accountCode,
      label: input.label ?? null,
      projectId: input.projectId ?? null,
      grantInstallmentId: input.grantInstallmentId ?? null,
      sponsorshipInstallmentId: input.sponsorshipInstallmentId ?? null,
    });
    return toChequeGraph(row);
  }

  @Mutation(() => ChequeGraph, { name: 'updateCheque' })
  async updateCheque(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateChequeInput,
  ): Promise<ChequeGraph> {
    const row = await this.cheques.update(club.id, {
      id: input.id,
      number: input.number,
      drawerName: input.drawerName,
      bankName: input.bankName,
      receivedOn:
        input.receivedOn === undefined
          ? undefined
          : input.receivedOn === null
            ? null
            : parseIsoDate(input.receivedOn),
      notes: input.notes,
    });
    return toChequeGraph(row);
  }

  @Mutation(() => ChequeGraph, { name: 'attachChequeImage' })
  async attachChequeImage(
    @CurrentClub() club: Club,
    @Args('chequeId', { type: () => ID }) chequeId: string,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
  ): Promise<ChequeGraph> {
    return toChequeGraph(
      await this.cheques.attachImage(club.id, chequeId, mediaAssetId),
    );
  }

  @Mutation(() => ChequeGraph, {
    name: 'cancelCheque',
    description:
      'Annule la saisie d’un chèque HORS facture encore en portefeuille : sa recette est contre-passée.',
  })
  async cancelCheque(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ): Promise<ChequeGraph> {
    return toChequeGraph(
      await this.cheques.cancelStandalone(club.id, user.userId, id, reason),
    );
  }

  @Mutation(() => ChequeDepositGraph, {
    name: 'createChequeDeposit',
    description:
      'Remise en banque de N chèques en portefeuille : une écriture DÉBIT 512x / CRÉDIT 511200 du total, un bordereau PDF.',
  })
  async createChequeDeposit(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateChequeDepositInput,
  ): Promise<ChequeDepositGraph> {
    const row = await this.deposits.create(club.id, user.userId, {
      financialAccountId: input.financialAccountId,
      depositedOn: parseIsoDate(input.depositedOn),
      chequeIds: input.chequeIds,
      notes: input.notes ?? null,
    });
    return toDepositGraph(row);
  }

  @Mutation(() => ChequeDepositGraph, { name: 'cancelChequeDeposit' })
  async cancelChequeDeposit(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
  ): Promise<ChequeDepositGraph> {
    return toDepositGraph(
      await this.deposits.cancel(club.id, user.userId, id, reason),
    );
  }

  @Mutation(() => ChequeDepositGraph, { name: 'generateChequeDepositSlip' })
  async generateChequeDepositSlip(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ChequeDepositGraph> {
    return toDepositGraph(
      await this.deposits.generateSlip(club.id, user.userId, id),
    );
  }
}
