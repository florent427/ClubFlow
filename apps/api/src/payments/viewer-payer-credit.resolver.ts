import { BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import { ViewerActiveProfileGuard } from '../common/guards/viewer-active-profile.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicePayerScopeService } from './invoice-payer-scope.service';
import { PayerCreditApplyResultGraph } from './models/payer-credit.model';
import { ViewerPayerCreditGraph } from './models/viewer-payer-credit.model';
import { resolveAccountPayerCreditRef } from './payer-credit-holder';
import { payerCreditMovements } from './payer-credit-movements';
import { PayerCreditService } from './payer-credit.service';
import { PaymentsService } from './payments.service';

/**
 * Crédit du payeur — surface PORTAIL et APPLI MEMBRE (ADR-0022, lot 3).
 *
 * Le crédit est celui du COMPTE connecté, jamais celui du profil actif : un
 * payeur peut basculer sur le profil d'un autre adulte du foyer, et le crédit
 * de cet adulte est son argent à lui. Les factures, elles, sont celles que le
 * profil actif peut régler en ligne, comme pour « Payer en ligne » ; puis
 * l'imputation refait le contrôle du payeur sur la personne du compte.
 */
@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
@RequireClubModule(ModuleCode.PAYMENT)
export class ViewerPayerCreditResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: PayerCreditService,
    private readonly payments: PaymentsService,
    private readonly payerScope: InvoicePayerScopeService,
  ) {}

  @Query(() => ViewerPayerCreditGraph, {
    name: 'viewerPayerCredit',
    description:
      'Crédit du compte connecté dans le club : solde et historique. Membre et contact d’un même compte partagent le même crédit.',
  })
  async viewerPayerCredit(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
  ): Promise<ViewerPayerCreditGraph> {
    const ref = await resolveAccountPayerCreditRef(
      this.prisma,
      club.id,
      user.userId,
    );
    if (!ref) return { balanceCents: 0, movements: [] };
    const credit = await this.credits.credit(club.id, ref);
    return {
      balanceCents: credit.balanceCents,
      movements: payerCreditMovements(credit),
    };
  }

  @Mutation(() => PayerCreditApplyResultGraph, {
    name: 'viewerApplyPayerCredit',
    description:
      'Règle une facture du foyer avec le crédit du compte connecté : mêmes effets qu’un encaissement, sans mouvement d’argent (ADR-0022).',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async viewerApplyPayerCredit(
    @CurrentUser() user: RequestUser,
    @CurrentClub() club: Club,
    @Args('invoiceId', { type: () => ID }) invoiceId: string,
    @Args('amountCents', {
      type: () => Int,
      nullable: true,
      description:
        'Montant confirmé par le payeur. Par défaut : le plus petit du crédit disponible et du reste à encaisser.',
    })
    amountCents?: number | null,
  ): Promise<PayerCreditApplyResultGraph> {
    const where = await this.payerScope.resolvePayerInvoiceWhere({
      clubId: club.id,
      activeProfile: {
        memberId: user.activeProfileMemberId ?? null,
        contactId: user.activeProfileContactId ?? null,
      },
      viewerUserId: user.userId,
    });
    if (!where) {
      throw new BadRequestException(
        'Seul le payeur du foyer peut régler une facture en ligne.',
      );
    }
    // Hors périmètre, une facture est indiscernable d'une facture inexistante.
    const invoice = await this.prisma.invoice.findFirst({
      where: { ...where, id: invoiceId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException('Facture introuvable.');
    }
    const ref = await resolveAccountPayerCreditRef(
      this.prisma,
      club.id,
      user.userId,
    );
    if (!ref) {
      throw new BadRequestException('Vous n’avez pas de crédit dans ce club.');
    }
    const applied = await this.payments.applyPayerCredit(club.id, {
      invoiceId: invoice.id,
      ...ref,
      amountCents: amountCents ?? null,
    });
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
