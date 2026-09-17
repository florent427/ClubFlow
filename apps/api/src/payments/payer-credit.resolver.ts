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
import { ApplyPayerCreditInput } from './dto/apply-payer-credit.input';
import { RecordPayerCreditDepositInput } from './dto/record-payer-credit-deposit.input';
import {
  FamilyPayerCreditGraph,
  PayerCreditApplyResultGraph,
  PayerCreditCandidateGraph,
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
    uses: credit.uses.map((u) => ({
      paymentId: u.paymentId,
      invoiceId: u.invoiceId,
      invoiceLabel: u.invoiceLabel,
      amountCents: u.amountCents,
      createdAt: u.createdAt,
    })),
  };
}

/** Crédit du payeur, côté admin (ADR-0022, lots 1 et 2). */
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
      'Crédit d’une personne (membre OU contact) : solde, avances versées et imputations.',
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

  @Query(() => [FamilyPayerCreditGraph], {
    name: 'clubFamilyPayerCredits',
    description:
      'Crédits des personnes d’un foyer, une ligne par personne, crédits nuls omis. Le foyer ne possède pas de crédit.',
  })
  async clubFamilyPayerCredits(
    @CurrentClub() club: Club,
    @Args('familyId', { type: () => ID }) familyId: string,
  ): Promise<FamilyPayerCreditGraph[]> {
    return this.credits.familyCredits(club.id, familyId);
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

  @Query(() => [PayerCreditCandidateGraph], {
    name: 'clubInvoicePayerCredits',
    description:
      'Personnes qui peuvent régler cette facture avec leur crédit, et combien elles en ont.',
  })
  async clubInvoicePayerCredits(
    @CurrentClub() club: Club,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
  ): Promise<PayerCreditCandidateGraph[]> {
    return this.payments.listPayerCreditCandidates(club.id, invoiceId);
  }

  @Mutation(() => PayerCreditApplyResultGraph, {
    name: 'applyPayerCreditToInvoice',
    description:
      'Règle une facture avec le crédit d’une personne : mêmes effets qu’un encaissement, sans mouvement d’argent (ADR-0022).',
  })
  async applyPayerCreditToInvoice(
    @CurrentClub() club: Club,
    @Args('input') input: ApplyPayerCreditInput,
  ): Promise<PayerCreditApplyResultGraph> {
    const applied = await this.payments.applyPayerCredit(club.id, input);
    return {
      paymentId: applied.payment.id,
      invoiceId: applied.invoiceId,
      amountCents: applied.payment.amountCents,
      creditBalanceCents: applied.creditBalanceCents,
      invoiceStatus: applied.invoiceStatus,
      invoiceBalanceCents: applied.invoiceBalanceCents,
    };
  }
}
