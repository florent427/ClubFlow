import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../../common/decorators/current-club.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireClubModule } from '../../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../../common/types/request-user';
import { ModuleCode } from '../../domain/module-registry/module-codes';
import { BankMemberTransferService } from './bank-member-transfer.service';
import { BankStatementService } from './bank-statement.service';
import { toDetail } from './bank-import.resolver';
import { AcceptBankLineMemberPaymentInput } from './dto/bank-import.input';
import { BankTransferResultGraph } from './models/bank-statement.model';

/**
 * Encaissement d'un virement d'adhérent (ADR-0014 §7). Résolveur à part
 * parce qu'il fait appel aux paiements, qui dépendent eux-mêmes de la
 * comptabilité : le faire vivre dans son propre module évite un cycle.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubAdminRoleGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.ACCOUNTING)
export class BankTransferResolver {
  constructor(
    private readonly transfers: BankMemberTransferService,
    private readonly statements: BankStatementService,
  ) {}

  @Mutation(() => BankTransferResultGraph, {
    name: 'acceptBankLineMemberPayment',
    description:
      'Encaisse un virement reçu sur les factures choisies : les paiements sont enregistrés un à un, puis la ligne est rapprochée des écritures produites.',
  })
  async acceptBankLineMemberPayment(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: AcceptBankLineMemberPaymentInput,
  ): Promise<BankTransferResultGraph> {
    const line = await this.statements.lineStatementId(club.id, input.lineId);
    const result = await this.transfers.acceptMemberPayment(
      club.id,
      user.userId,
      input.lineId,
      input.allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amountCents: a.amountCents,
        paidByMemberId: a.paidByMemberId ?? null,
        paidByContactId: a.paidByContactId ?? null,
      })),
    );
    return {
      invoicesPaid: result.invoicesPaid,
      lineMatched: result.lineMatched,
      stoppedBecause: result.stoppedBecause,
      statement: toDetail(await this.statements.getById(club.id, line)),
    };
  }
}
