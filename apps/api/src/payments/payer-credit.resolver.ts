import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubAdminRoleGuard } from '../common/guards/club-admin-role.guard';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { RecordPayerCreditDepositInput } from './dto/record-payer-credit-deposit.input';
import {
  PayerCreditDepositResultGraph,
  PayerCreditGraph,
} from './models/payer-credit.model';
import { PayerCreditService, type PayerCredit } from './payer-credit.service';
import { PaymentsService } from './payments.service';

function toGraph(credit: PayerCredit): PayerCreditGraph {
  return {
    memberId: credit.holder.memberId,
    contactId: credit.holder.contactId,
    displayName: credit.holder.displayName,
    balanceCents: credit.balanceCents,
    deposits: credit.deposits.map((d) => ({
      invoiceId: d.invoiceId,
      label: d.label,
      createdAt: d.createdAt,
      amountCents: d.amountCents,
      payments: d.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        externalRef: p.externalRef,
        createdAt: p.createdAt,
      })),
    })),
  };
}

/** Crédit du payeur, côté admin (ADR-0022, lot 1). */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubAdminRoleGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class PayerCreditResolver {
  constructor(
    private readonly credits: PayerCreditService,
    private readonly payments: PaymentsService,
  ) {}

  @Query(() => PayerCreditGraph, {
    name: 'clubPayerCredit',
    description:
      'Crédit d’une personne (membre OU contact) : solde et avances versées.',
  })
  async clubPayerCredit(
    @CurrentClub() club: Club,
    @Args('memberId', { type: () => ID, nullable: true })
    memberId?: string | null,
    @Args('contactId', { type: () => ID, nullable: true })
    contactId?: string | null,
  ): Promise<PayerCreditGraph> {
    return toGraph(await this.credits.credit(club.id, { memberId, contactId }));
  }

  @Mutation(() => PayerCreditDepositResultGraph, {
    name: 'recordPayerCreditDeposit',
    description:
      'Encaisse une avance sans facture : un reçu d’avance naît payé, et son montant passe au crédit de la personne (ADR-0022).',
  })
  async recordPayerCreditDeposit(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: RecordPayerCreditDepositInput,
  ): Promise<PayerCreditDepositResultGraph> {
    const { invoice, payment } = await this.payments.recordPayerCreditDeposit(
      club.id,
      input,
      user.userId,
    );
    const credit = await this.credits.credit(club.id, {
      memberId: input.memberId,
      contactId: input.contactId,
    });
    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      balanceCents: credit.balanceCents,
    };
  }
}
